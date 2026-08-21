"""Tests contre un vrai MongoDB.

Le reste de la suite tourne sur un simulateur : rapide, mais il n'implémente
qu'une approximation du moteur. Ces tests-là valident sur le vrai serveur les
comportements dont le code dépend réellement — les index uniques, la sémantique
des requêtes, et surtout la course entre deux envois simultanés, qu'un
simulateur synchrone ne peut pas reproduire.

Ignorés automatiquement si aucun MongoDB n'écoute (`MONGODB_TEST_URI`), sauf si
`REQUIRE_MONGO=1` : la CI pose ce drapeau pour que la disparition du service
fasse rougir la CI au lieu d'escamoter silencieusement ces tests. Une CI verte
qui saute ses tests les plus importants ne prouve rien.
"""

import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from app.database import create_indexes
from tests.conftest import booking_payload, make_partner, register

MONGODB_TEST_URI = os.environ.get("MONGODB_TEST_URI", "mongodb://127.0.0.1:27017")
REQUIRE_MONGO = os.environ.get("REQUIRE_MONGO") == "1"
BASE = "/api/v1/bookings"


@pytest_asyncio.fixture
async def database():
    """Remplace la base simulée du conftest par un vrai MongoDB."""
    client = AsyncIOMotorClient(MONGODB_TEST_URI, serverSelectionTimeoutMS=1500)
    try:
        await client.admin.command("ping")
    except Exception as error:
        if REQUIRE_MONGO:
            pytest.fail(f"MongoDB exigé mais injoignable sur {MONGODB_TEST_URI} : {error}")
        pytest.skip(f"Aucun MongoDB joignable sur {MONGODB_TEST_URI}")

    # Une base jetable par test : les tests restent indépendants et parallélisables.
    name = f"fightconnect_it_{uuid.uuid4().hex[:10]}"
    db = client[name]
    await create_indexes(db)

    yield db

    await client.drop_database(name)
    client.close()


async def test_l_index_email_est_bien_unique(database):
    await database.users.insert_one({"email": "jean@exemple.com"})

    with pytest.raises(DuplicateKeyError):
        await database.users.insert_one({"email": "jean@exemple.com"})


async def test_dix_envois_reellement_simultanes_ne_font_qu_une_demande(client):
    """La course que le simulateur ne peut pas produire.

    Avec un vrai serveur, les requêtes rendent la main sur chaque aller-retour
    réseau : elles peuvent toutes lire « aucune demande en attente » avant que
    l'une n'écrive. Seul l'index unique partiel tranche. À dix candidats, la
    régression se détecte de façon fiable — à deux, l'entrelacement dépend du
    timing et le test passerait parfois sans le garde-fou.
    """
    luis = await make_partner(client)
    ana = await register(client, "ana@exemple.com", "Ana")

    payload = booking_payload(luis["user"]["id"])
    reponses = await asyncio.gather(
        *(client.post(BASE, json=payload, headers=ana["headers"]) for _ in range(10)),
        return_exceptions=True,
    )

    for reponse in reponses:
        assert not isinstance(reponse, Exception), reponse
        assert reponse.status_code in {200, 201}, reponse.text

    liste = await client.get(BASE, params={"direction": "sent"}, headers=ana["headers"])
    assert liste.json()["total"] == 1


async def test_un_creneau_refuse_reste_redemandable(client):
    """L'unicité ne vaut que pour les demandes en attente.

    Sans le filtre partiel de l'index, un refus fermerait définitivement ce
    créneau entre ces deux personnes.
    """
    luis = await make_partner(client)
    ana = await register(client, "ana@exemple.com", "Ana")
    payload = booking_payload(luis["user"]["id"])

    premiere = await client.post(BASE, json=payload, headers=ana["headers"])
    await client.post(
        f"{BASE}/{premiere.json()['id']}/decline", headers=luis["headers"]
    )

    seconde = await client.post(BASE, json=payload, headers=ana["headers"])

    assert seconde.status_code == 201
    assert seconde.json()["id"] != premiere.json()["id"]


async def test_recherche_et_filtres_sur_le_vrai_moteur(client, database):
    await make_partner(
        client, email="luis@exemple.com", first_name="Luis", style="boxing", city="Paris"
    )
    await make_partner(
        client, email="maria@exemple.com", first_name="Maria", style="mma", city="Lyon"
    )
    chercheur = await register(client, "chercheur@exemple.com", "Ana")

    # La ville se cherche par préfixe, sans tenir compte de la casse.
    recherche = await client.get(
        "/api/v1/partners", params={"city": "LYO"}, headers=chercheur["headers"]
    )
    assert [item["first_name"] for item in recherche.json()["items"]] == ["Maria"]

    discipline = await client.get(
        "/api/v1/partners", params={"style": "mma"}, headers=chercheur["headers"]
    )
    assert discipline.json()["total"] == 1

    # Un partenaire qui se met en pause disparaît de la recherche.
    await database.users.update_one({"email": "maria@exemple.com"}, {"$set": {"available": False}})
    apres = await client.get("/api/v1/partners", headers=chercheur["headers"])
    assert [item["first_name"] for item in apres.json()["items"]] == ["Luis"]


async def test_parcours_complet_de_bout_en_bout(client, database):
    """Profil, recherche, demande, accord, séance passée, avis, statistiques."""
    luis = await make_partner(client, price_per_round=0)
    ana = await register(client, "ana@exemple.com", "Ana")

    trouves = await client.get("/api/v1/partners", headers=ana["headers"])
    assert trouves.json()["total"] == 1

    creation = await client.post(
        BASE, json=booking_payload(luis["user"]["id"], rounds=3), headers=ana["headers"]
    )
    assert creation.status_code == 201
    booking = creation.json()
    assert booking["rounds"] == 3

    accord = await client.post(f"{BASE}/{booking['id']}/accept", headers=luis["headers"])
    assert accord.json()["status"] == "accepted"

    # La séance a eu lieu : aucune tâche planifiée ne le fait, on avance l'horaire.
    await database.bookings.update_one(
        {"_id": ObjectId(booking["id"])},
        {"$set": {"scheduled_at": datetime.now(timezone.utc) - timedelta(days=1)}},
    )
    cloture = await client.post(f"{BASE}/{booking['id']}/complete", headers=ana["headers"])
    assert cloture.json()["status"] == "completed"

    avis = await client.post(
        "/api/v1/moderation/reviews",
        json={"booking_id": booking["id"], "rating": 5, "comment": "Excellente séance, merci."},
        headers=ana["headers"],
    )
    assert avis.status_code == 201
    assert avis.json()["flagged"] is False

    liste_avis = await client.get(f"{BASE}/{booking['id']}/reviews")
    assert liste_avis.json()["total"] == 1

    profil = await client.get("/api/v1/auth/me", headers=luis["headers"])
    assert profil.json()["average_rating"] == 5.0

    stats = await client.get("/api/v1/revenue/stats", headers=luis["headers"])
    assert stats.json()["total_bookings"] == 1
    assert stats.json()["completed_bookings"] == 1


async def test_le_freinage_de_connexion_fonctionne_sur_le_vrai_moteur(client):
    from app.services import throttle

    await register(client)

    for _ in range(throttle.MAX_FAILURES):
        echec = await client.post(
            "/api/v1/auth/login", json={"email": "jean@exemple.com", "password": "Faux1234"}
        )
        assert echec.status_code == 401

    bloque = await client.post(
        "/api/v1/auth/login", json={"email": "jean@exemple.com", "password": "Sparring1"}
    )
    assert bloque.status_code == 429
