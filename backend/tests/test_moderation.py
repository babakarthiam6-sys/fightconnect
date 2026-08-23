"""Avis, modération et recommandations, sur le modèle des réservations."""

from datetime import datetime, timedelta, timezone

import pytest

from bson import ObjectId

from app.services.moderation import detect_payment_bypass
from tests.conftest import booking_payload, make_partner, register

BASE = "/api/v1/moderation"


async def setup_seance_passee(client, database):
    """Un partenaire, une personne qui a réservé, et une séance déjà passée.

    Un avis n'est recevable qu'après la séance : on avance donc la demande dans
    son cycle de vie jusqu'à « terminée ».
    """
    luis = await make_partner(client)
    ana = await register(client, "ana@exemple.com", "Ana")

    creation = await client.post(
        "/api/v1/bookings",
        json=booking_payload(luis["user"]["id"]),
        headers=ana["headers"],
    )
    booking = creation.json()
    await client.post(f"/api/v1/bookings/{booking['id']}/accept", headers=luis["headers"])

    await database.bookings.update_one(
        {"_id": ObjectId(booking["id"])},
        {"$set": {"scheduled_at": datetime.now(timezone.utc) - timedelta(days=1)}},
    )
    await client.post(f"/api/v1/bookings/{booking['id']}/complete", headers=ana["headers"])

    return luis, booking, ana


async def test_avis_refuse_a_un_tiers(client, database):
    _, booking, _ = await setup_seance_passee(client, database)
    intrus = await register(client, "intrus@exemple.com", "Intrus")

    response = await client.post(
        f"{BASE}/reviews",
        json={"booking_id": booking["id"], "rating": 5, "comment": "Super séance de boxe."},
        headers=intrus["headers"],
    )

    assert response.status_code == 403


async def test_avis_refuse_avant_la_seance(client):
    """Noter une séance qui n'a pas eu lieu n'a aucune valeur informative."""
    luis = await make_partner(client)
    ana = await register(client, "ana@exemple.com", "Ana")
    creation = await client.post(
        "/api/v1/bookings",
        json=booking_payload(luis["user"]["id"]),
        headers=ana["headers"],
    )

    response = await client.post(
        f"{BASE}/reviews",
        json={
            "booking_id": creation.json()["id"],
            "rating": 5,
            "comment": "Très bonne séance, merci.",
        },
        headers=ana["headers"],
    )

    assert response.status_code == 409


async def test_avis_publie_apres_la_seance(client, database):
    _, booking, ana = await setup_seance_passee(client, database)

    response = await client.post(
        f"{BASE}/reviews",
        json={"booking_id": booking["id"], "rating": 5, "comment": "Très bonne séance, merci."},
        headers=ana["headers"],
    )

    assert response.status_code == 201
    body = response.json()
    assert body["flagged"] is False
    assert body["author"]["id"] == ana["user"]["id"]


async def test_avis_abusif_est_signale(client, database):
    _, booking, ana = await setup_seance_passee(client, database)

    response = await client.post(
        f"{BASE}/reviews",
        json={
            "booking_id": booking["id"],
            "rating": 1,
            "comment": "Quel connard, séance nulle et dangereuse.",
        },
        headers=ana["headers"],
    )

    assert response.status_code == 201
    assert response.json()["flagged"] is True
    assert response.json()["flag_reason"] == "harassment"


async def test_un_seul_avis_par_demande(client, database):
    _, booking, ana = await setup_seance_passee(client, database)
    avis = {"booking_id": booking["id"], "rating": 4, "comment": "Bonne séance technique."}

    await client.post(f"{BASE}/reviews", json=avis, headers=ana["headers"])
    doublon = await client.post(f"{BASE}/reviews", json=avis, headers=ana["headers"])

    assert doublon.status_code == 409


async def test_avis_met_a_jour_la_note_du_partenaire(client, database):
    luis, booking, ana = await setup_seance_passee(client, database)

    await client.post(
        f"{BASE}/reviews",
        json={"booking_id": booking["id"], "rating": 4, "comment": "Bonne séance technique."},
        headers=ana["headers"],
    )

    profil = await client.get("/api/v1/auth/me", headers=luis["headers"])
    assert profil.json()["average_rating"] == 4
    assert profil.json()["ratings_count"] == 1


async def test_un_avis_signale_ne_compte_pas_dans_la_note(client, database):
    luis, booking, ana = await setup_seance_passee(client, database)

    await client.post(
        f"{BASE}/reviews",
        json={"booking_id": booking["id"], "rating": 1, "comment": "Sale race, à éviter."},
        headers=ana["headers"],
    )

    profil = await client.get("/api/v1/auth/me", headers=luis["headers"])
    assert profil.json()["average_rating"] is None


async def test_profil_de_risque(client, database):
    _, booking, ana = await setup_seance_passee(client, database)
    lecteur = await register(client, "lecteur@exemple.com", "Lecteur")

    vierge = await client.get(
        f"{BASE}/user-risk/{ana['user']['id']}", headers=lecteur["headers"]
    )
    assert vierge.json()["risk_level"] == "low"

    await client.post(
        f"{BASE}/reviews",
        json={"booking_id": booking["id"], "rating": 1, "comment": "Ta gueule, séance nulle."},
        headers=ana["headers"],
    )

    apres = await client.get(
        f"{BASE}/user-risk/{ana['user']['id']}", headers=lecteur["headers"]
    )
    assert apres.json()["risk_level"] == "high"
    assert apres.json()["reasons"]


async def test_profil_de_risque_utilisateur_inconnu(client):
    lecteur = await register(client)
    response = await client.get(
        f"{BASE}/user-risk/000000000000000000000000", headers=lecteur["headers"]
    )
    assert response.status_code == 404


async def test_les_recommandations_privilegient_la_meme_discipline(client):
    await make_partner(client, email="boxeur@exemple.com", first_name="Luis", style="boxing")
    await make_partner(client, email="judoka@exemple.com", first_name="Maria", style="judo")

    ana = await make_partner(
        client, email="ana@exemple.com", first_name="Ana", style="judo", city="Lyon"
    )

    response = await client.get(f"{BASE}/recommendations", headers=ana["headers"])

    prenoms = [item["first_name"] for item in response.json()["items"]]
    assert prenoms[0] == "Maria"
    assert "Ana" not in prenoms


@pytest.mark.parametrize(
    "message",
    [
        "Let's do it outside the app, cash in hand",
        "Can you send it on WhatsApp instead? We can skip the fee",
        "I'll pay you with Venmo, no need for the platform",
        "Pay me under the table, +33 6 12 34 56 78",
        "Let's avoid the commission, my Wise account is ready",
    ],
)
def test_le_contournement_est_vu_aussi_en_anglais(message):
    """L'heuristique locale ne parlait que français.

    Sans clé OpenAI — c'est le cas en production aujourd'hui — un message
    anglais proposant de sortir de la plateforme passait sans être vu. Or c'est
    exactement la transaction qui ne revient jamais.
    """
    assert detect_payment_bypass(message).flagged is True


@pytest.mark.parametrize(
    "message",
    [
        "See you at the gym tomorrow, I'll bring my own gloves",
        "Great session today, thanks for the tips on my jab",
        "I train at a club near the station, is that ok for you?",
    ],
)
def test_un_message_anglais_anodin_passe(message):
    """Élargir les motifs ne doit pas transformer l'anglais en suspect.

    « app » et « fee » sont des mots courants : seuls comptent les motifs où
    ils suivent une intention d'esquive.
    """
    assert detect_payment_bypass(message).flagged is False
