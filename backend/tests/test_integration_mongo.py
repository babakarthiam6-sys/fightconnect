"""Tests contre un vrai MongoDB.

Le reste de la suite tourne sur un simulateur : rapide, mais il n'implémente
qu'une approximation du moteur. Ces tests-là valident sur le vrai serveur les
comportements dont le code dépend réellement — l'index unique, la sémantique des
requêtes, et surtout la course entre deux inscriptions, qu'un simulateur
synchrone ne peut pas reproduire.

Ignorés automatiquement si aucun MongoDB n'écoute (`MONGODB_TEST_URI`).
"""

import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError

from app.database import create_indexes
from tests.conftest import register, sparring_payload

MONGODB_TEST_URI = os.environ.get("MONGODB_TEST_URI", "mongodb://127.0.0.1:27017")
BASE = "/api/v1/sparrings"


@pytest_asyncio.fixture
async def database():
    """Remplace la base simulée du conftest par un vrai MongoDB."""
    client = AsyncIOMotorClient(MONGODB_TEST_URI, serverSelectionTimeoutMS=1500)
    try:
        await client.admin.command("ping")
    except Exception:
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


async def test_deux_inscriptions_reellement_simultanees(client):
    """La course que le simulateur ne peut pas produire.

    Avec un vrai serveur, les deux requêtes rendent la main sur chaque
    aller-retour réseau : elles peuvent lire toutes les deux « il reste une
    place » avant que l'une n'écrive. À deux, l'entrelacement dépend du timing —
    c'est le test à dix candidats qui détecte la régression de façon fiable.
    """
    organisateur = await register(client, "orga@exemple.com", "Ada")
    creation = await client.post(
        BASE, json=sparring_payload(price=0, max_participants=2), headers=organisateur["headers"]
    )
    sparring = creation.json()

    premier = await register(client, "premier@exemple.com", "Premier")
    await client.post(f"{BASE}/{sparring['id']}/join", headers=premier["headers"])

    second = await register(client, "second@exemple.com", "Second")
    troisieme = await register(client, "troisieme@exemple.com", "Troisieme")

    reponses = await asyncio.gather(
        client.post(f"{BASE}/{sparring['id']}/join", headers=second["headers"]),
        client.post(f"{BASE}/{sparring['id']}/join", headers=troisieme["headers"]),
    )

    assert sorted(reponse.status_code for reponse in reponses) == [200, 409]

    detail = await client.get(f"{BASE}/{sparring['id']}")
    assert len(detail.json()["participants"]) == 2
    assert detail.json()["status"] == "full"


async def test_dix_inscriptions_simultanees_sur_une_seule_place(client):
    """Cas extrême : une place, dix candidats en même temps."""
    organisateur = await register(client, "orga@exemple.com", "Ada")
    creation = await client.post(
        BASE, json=sparring_payload(price=0, max_participants=2), headers=organisateur["headers"]
    )
    sparring = creation.json()

    premier = await register(client, "premier@exemple.com", "Premier")
    await client.post(f"{BASE}/{sparring['id']}/join", headers=premier["headers"])

    candidats = [
        await register(client, f"candidat{index}@exemple.com", f"C{index}") for index in range(10)
    ]
    reponses = await asyncio.gather(
        *(
            client.post(f"{BASE}/{sparring['id']}/join", headers=candidat["headers"])
            for candidat in candidats
        )
    )

    codes = [reponse.status_code for reponse in reponses]
    assert codes.count(200) == 1
    assert codes.count(409) == 9

    detail = await client.get(f"{BASE}/{sparring['id']}")
    assert len(detail.json()["participants"]) == 2


async def test_recherche_et_filtres_sur_le_vrai_moteur(client, database):
    organisateur = await register(client)
    await client.post(
        BASE, json=sparring_payload(title="Boxe à Paris", price=20), headers=organisateur["headers"]
    )
    await client.post(
        BASE,
        json=sparring_payload(title="MMA à Lyon", location="Lyon", style="mma", price=60),
        headers=organisateur["headers"],
    )

    # Recherche insensible à la casse et aux accents de casse.
    recherche = await client.get(BASE, params={"search": "LYON"})
    assert [item["title"] for item in recherche.json()["items"]] == ["MMA à Lyon"]

    fourchette = await client.get(BASE, params={"min_price": 10, "max_price": 30})
    assert [item["title"] for item in fourchette.json()["items"]] == ["Boxe à Paris"]

    discipline = await client.get(BASE, params={"style": "mma"})
    assert discipline.json()["total"] == 1

    # Une séance passée disparaît de la navigation.
    await database.sparrings.update_one(
        {"title": "MMA à Lyon"},
        {"$set": {"scheduled_at": datetime.now(timezone.utc) - timedelta(days=1)}},
    )
    navigation = await client.get(BASE)
    assert [item["title"] for item in navigation.json()["items"]] == ["Boxe à Paris"]


async def test_parcours_complet_de_bout_en_bout(client):
    """Inscription, publication, participation, avis, statistiques."""
    organisateur = await register(client, "orga@exemple.com", "Ada")
    creation = await client.post(
        BASE, json=sparring_payload(price=0), headers=organisateur["headers"]
    )
    assert creation.status_code == 201
    sparring = creation.json()

    partenaire = await register(client, "partenaire@exemple.com", "Léa")
    assert (
        await client.post(f"{BASE}/{sparring['id']}/join", headers=partenaire["headers"])
    ).status_code == 200

    avis = await client.post(
        "/api/v1/moderation/reviews",
        json={"sparring_id": sparring["id"], "rating": 5, "comment": "Excellente séance, merci."},
        headers=partenaire["headers"],
    )
    assert avis.status_code == 201
    assert avis.json()["flagged"] is False

    liste_avis = await client.get(f"{BASE}/{sparring['id']}/reviews")
    assert liste_avis.json()["total"] == 1

    profil = await client.get("/api/v1/auth/me", headers=organisateur["headers"])
    assert profil.json()["average_rating"] == 5.0

    stats = await client.get("/api/v1/revenue/stats", headers=organisateur["headers"])
    assert stats.json()["total_sparrings"] == 1

    historique = await client.get(BASE, params={"creator_id": organisateur["user"]["id"]})
    assert historique.json()["total"] == 1


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
