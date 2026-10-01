"""Suppression du compte : l'argent d'abord, les données ensuite."""

from datetime import datetime, timezone

import pytest
from bson import ObjectId
from fastapi import HTTPException

from app.routers import auth as auth_router
from app.routers import bookings as bookings_router
from tests.conftest import register
# `stripe_ok` est une fixture : l'importer suffit à la rendre disponible ici.
from tests.test_payments import demande_acceptee, stripe_ok  # noqa: F401

ME = "/api/v1/auth/me"


@pytest.fixture
def stripe_suivi(monkeypatch, stripe_ok):  # noqa: F811
    """Stripe simulé, qui garde la trace de chaque appel."""
    appels: dict[str, list[str]] = {"remboursements": [], "annulations": []}
    statuts: dict[str, str | None] = {}

    async def rembourser(payment_intent_id: str) -> dict[str, object]:
        appels["remboursements"].append(payment_intent_id)
        return {"id": "re_1", "status": "succeeded"}

    async def annuler(payment_intent_id: str) -> None:
        appels["annulations"].append(payment_intent_id)

    async def statut(payment_intent_id: str) -> str | None:
        return statuts.get(payment_intent_id, "requires_payment_method")

    monkeypatch.setattr(bookings_router, "refund_payment", rembourser)
    monkeypatch.setattr(auth_router, "cancel_payment_intent", annuler)
    monkeypatch.setattr(auth_router, "retrieve_payment_status", statut)
    return {"appels": appels, "statuts": statuts}


async def payer(client, database, ana, booking, statut: str = "succeeded") -> None:
    await client.post(
        "/api/v1/payments/create-intent",
        json={"booking_id": booking["id"]},
        headers=ana["headers"],
    )
    await database.payments.update_one(
        {"payment_intent_id": "pi_test_123"}, {"$set": {"status": statut}}
    )


async def test_le_compte_supprime_ne_sert_plus(client, database):
    jean = await register(client)

    response = await client.delete(ME, headers=jean["headers"])

    assert response.status_code == 204
    assert await database.users.find_one({"email": "jean@exemple.com"}) is None
    assert (await client.get(ME, headers=jean["headers"])).status_code == 401
    connexion = await client.post(
        "/api/v1/auth/login", json={"email": "jean@exemple.com", "password": "Sparring1"}
    )
    assert connexion.status_code == 401


async def test_une_seance_payee_est_remboursee_avant_l_annulation(
    client, database, stripe_suivi
):
    _, ana, booking = await demande_acceptee(client, database)
    await payer(client, database, ana, booking)

    response = await client.delete(ME, headers=ana["headers"])

    assert response.status_code == 204
    assert stripe_suivi["appels"]["remboursements"] == ["pi_test_123"]
    demande = await database.bookings.find_one({"_id": ObjectId(booking["id"])})
    assert demande["status"] == "cancelled"
    assert demande["paid"] is False
    # La trace du paiement reste, pour la comptabilité.
    paiement = await database.payments.find_one({"payment_intent_id": "pi_test_123"})
    assert paiement["status"] == "refunded"


async def test_un_remboursement_impossible_conserve_le_compte(
    client, database, stripe_suivi, monkeypatch
):
    async def en_panne(payment_intent_id: str) -> dict[str, object]:
        raise HTTPException(status_code=502, detail="Stripe injoignable")

    monkeypatch.setattr(bookings_router, "refund_payment", en_panne)
    _, ana, booking = await demande_acceptee(client, database)
    await payer(client, database, ana, booking)

    response = await client.delete(ME, headers=ana["headers"])

    assert response.status_code == 502
    assert await database.users.find_one({"email": "ana@exemple.com"}) is not None
    demande = await database.bookings.find_one({"_id": ObjectId(booking["id"])})
    assert demande["status"] == "accepted"


async def test_un_paiement_ouvert_est_annule_chez_stripe(client, database, stripe_suivi):
    _, ana, booking = await demande_acceptee(client, database)
    await payer(client, database, ana, booking, statut="pending")

    response = await client.delete(ME, headers=ana["headers"])

    assert response.status_code == 204
    assert stripe_suivi["appels"]["annulations"] == ["pi_test_123"]
    assert stripe_suivi["appels"]["remboursements"] == []
    paiement = await database.payments.find_one({"payment_intent_id": "pi_test_123"})
    assert paiement["status"] == "cancelled"


async def test_un_paiement_abouti_que_le_webhook_n_a_pas_signale_est_rembourse(
    client, database, stripe_suivi
):
    _, ana, booking = await demande_acceptee(client, database)
    await payer(client, database, ana, booking, statut="pending")
    stripe_suivi["statuts"]["pi_test_123"] = "succeeded"

    response = await client.delete(ME, headers=ana["headers"])

    assert response.status_code == 204
    assert stripe_suivi["appels"]["remboursements"] == ["pi_test_123"]
    assert stripe_suivi["appels"]["annulations"] == []
    paiement = await database.payments.find_one({"payment_intent_id": "pi_test_123"})
    assert paiement["status"] == "refunded"


@pytest.mark.parametrize(
    ("statut_stripe", "code"),
    [("processing", 409), (None, 503)],
)
async def test_un_paiement_incertain_bloque_la_suppression(
    client, database, stripe_suivi, statut_stripe, code
):
    _, ana, booking = await demande_acceptee(client, database)
    await payer(client, database, ana, booking, statut="pending")
    stripe_suivi["statuts"]["pi_test_123"] = statut_stripe

    response = await client.delete(ME, headers=ana["headers"])

    assert response.status_code == code
    assert stripe_suivi["appels"] == {"remboursements": [], "annulations": []}
    assert await database.users.find_one({"email": "ana@exemple.com"}) is not None
    demande = await database.bookings.find_one({"_id": ObjectId(booking["id"])})
    assert demande["status"] == "accepted"


async def test_le_partenaire_supprime_disparait_des_donnees_des_autres(
    client, database, stripe_suivi
):
    luis, ana, booking = await demande_acceptee(client, database)
    await payer(client, database, ana, booking)
    luis_id = ObjectId(luis["user"]["id"])
    ana_id = ObjectId(ana["user"]["id"])

    maintenant = datetime.now(timezone.utc)
    await database.messages.insert_many(
        [
            {"sender_id": ana_id, "recipient_id": luis_id, "created_at": maintenant},
            {"sender_id": luis_id, "recipient_id": ana_id, "created_at": maintenant},
        ]
    )
    await database.reviews.insert_one(
        {"booking_id": ObjectId(booking["id"]), "author_id": ana_id, "rating": 5}
    )

    response = await client.delete(ME, headers=luis["headers"])

    assert response.status_code == 204
    # Ana est remboursée : la séance n'aura pas lieu.
    assert stripe_suivi["appels"]["remboursements"] == ["pi_test_123"]
    paiement = await database.payments.find_one({"payment_intent_id": "pi_test_123"})
    assert paiement["partner_name"] == "Compte supprimé"
    assert await database.messages.count_documents({}) == 0
    assert await database.reviews.count_documents({}) == 0

    # L'historique d'Ana reste lisible, sans le partenaire.
    liste = await client.get(
        "/api/v1/bookings", params={"direction": "sent"}, headers=ana["headers"]
    )
    assert liste.status_code == 200
    assert liste.json()["items"][0]["partner"] is None
    assert liste.json()["items"][0]["status"] == "cancelled"


async def test_les_avis_laisses_aux_autres_restent_sans_auteur(client, database):
    jean = await register(client)
    jean_id = ObjectId(jean["user"]["id"])
    await database.reviews.insert_one(
        {"booking_id": ObjectId(), "author_id": jean_id, "rating": 4, "comment": "Bien"}
    )

    response = await client.delete(ME, headers=jean["headers"])

    assert response.status_code == 204
    avis = await database.reviews.find_one({"comment": "Bien"})
    assert avis is not None
    assert "author_id" not in avis
