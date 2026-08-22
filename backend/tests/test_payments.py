"""Paiement d'une demande acceptée : intention Stripe, historique, remboursement."""

import pytest

from app.routers import bookings as bookings_router
from app.routers import payments as payments_router
from tests.conftest import booking_payload, make_partner, register

BASE = "/api/v1/payments"


@pytest.fixture
def stripe_ok(monkeypatch):
    """Simule un Stripe configuré et disponible."""

    async def fake_intent(
        amount: float,
        metadata: dict[str, str],
        destination_account: str | None = None,
        application_fee: float | None = None,
    ) -> dict[str, object]:
        return {
            "id": "pi_test_123",
            "client_secret": "pi_test_123_secret",
            "amount": amount,
            "currency": "EUR",
        }

    monkeypatch.setattr(payments_router, "create_payment_intent", fake_intent)
    return fake_intent


async def activer_versements(database, email: str) -> None:
    """Simule un partenaire ayant terminé son inscription Stripe.

    Sans versements actifs, le paiement est refusé en amont : la plateforme
    refuse d'encaisser pour quelqu'un qu'elle ne peut pas payer.
    """
    await database.users.update_one(
        {"email": email},
        {"$set": {"stripe_account_id": "acct_test_1", "stripe_payouts_enabled": True}},
    )


async def demande_acceptee(client, database, price: float = 25, rounds: int = 1):
    """Un partenaire payable, une demande envoyée puis acceptée."""
    luis = await make_partner(client, price_per_round=price)
    await activer_versements(database, "luis@exemple.com")

    ana = await register(client, "ana@exemple.com", "Ana")
    creation = await client.post(
        "/api/v1/bookings",
        json=booking_payload(luis["user"]["id"], rounds=rounds),
        headers=ana["headers"],
    )
    assert creation.status_code == 201, creation.text
    booking = creation.json()

    await client.post(f"/api/v1/bookings/{booking['id']}/accept", headers=luis["headers"])
    return luis, ana, booking


async def test_create_intent_exige_une_authentification(client):
    response = await client.post(f"{BASE}/create-intent", json={"booking_id": "x"})
    assert response.status_code == 401


async def test_sans_cle_stripe_le_paiement_est_indisponible(client, database):
    _, ana, booking = await demande_acceptee(client, database)

    response = await client.post(
        f"{BASE}/create-intent",
        json={"booking_id": booking["id"]},
        headers=ana["headers"],
    )

    # 503 et non 500 : le service est correctement configuré côté code, il
    # manque seulement la clé.
    assert response.status_code == 503
    assert "STRIPE_SECRET_KEY" in response.json()["detail"]


async def test_create_intent_renvoie_un_client_secret(client, stripe_ok, database):
    _, ana, booking = await demande_acceptee(client, database, price=25, rounds=2)

    response = await client.post(
        f"{BASE}/create-intent",
        json={"booking_id": booking["id"]},
        headers=ana["headers"],
    )

    assert response.status_code == 200
    body = response.json()
    assert body["client_secret"] == "pi_test_123_secret"
    # Le montant facturé est bien celui de la demande, rounds compris.
    assert body["amount"] == 50


async def test_une_demande_non_acceptee_ne_se_paie_pas(client, stripe_ok, database):
    """Payer avant l'accord du partenaire engagerait l'argent pour rien."""
    luis = await make_partner(client, price_per_round=25)
    await activer_versements(database, "luis@exemple.com")
    ana = await register(client, "ana@exemple.com", "Ana")

    creation = await client.post(
        "/api/v1/bookings",
        json=booking_payload(luis["user"]["id"]),
        headers=ana["headers"],
    )

    response = await client.post(
        f"{BASE}/create-intent",
        json={"booking_id": creation.json()["id"]},
        headers=ana["headers"],
    )

    assert response.status_code == 409


async def test_seul_le_demandeur_paie(client, stripe_ok, database):
    luis, _, booking = await demande_acceptee(client, database)

    response = await client.post(
        f"{BASE}/create-intent",
        json={"booking_id": booking["id"]},
        headers=luis["headers"],
    )

    assert response.status_code == 403


async def test_un_partenaire_sans_versements_bloque_le_paiement(client, stripe_ok):
    """La plateforme refuse d'encaisser pour quelqu'un qu'elle ne peut pas payer."""
    luis = await make_partner(client, price_per_round=25)
    ana = await register(client, "ana@exemple.com", "Ana")
    creation = await client.post(
        "/api/v1/bookings",
        json=booking_payload(luis["user"]["id"]),
        headers=ana["headers"],
    )
    booking = creation.json()
    await client.post(f"/api/v1/bookings/{booking['id']}/accept", headers=luis["headers"])

    response = await client.post(
        f"{BASE}/create-intent",
        json={"booking_id": booking["id"]},
        headers=ana["headers"],
    )

    assert response.status_code == 409


async def test_une_seance_gratuite_ne_cree_pas_de_paiement(client, stripe_ok, database):
    _, ana, booking = await demande_acceptee(client, database, price=0)

    response = await client.post(
        f"{BASE}/create-intent",
        json={"booking_id": booking["id"]},
        headers=ana["headers"],
    )

    assert response.status_code == 400


async def test_historique_liste_les_paiements_du_seul_utilisateur(client, stripe_ok, database):
    _, ana, booking = await demande_acceptee(client, database)
    tiers = await register(client, "tiers@exemple.com", "Tiers")

    await client.post(
        f"{BASE}/create-intent",
        json={"booking_id": booking["id"]},
        headers=ana["headers"],
    )

    mien = await client.get(f"{BASE}/history", headers=ana["headers"])
    autre = await client.get(f"{BASE}/history", headers=tiers["headers"])

    assert mien.json()["total"] == 1
    assert mien.json()["items"][0]["partner_name"] == "Luis Dupont"
    assert mien.json()["items"][0]["status"] == "pending"
    assert autre.json()["total"] == 0


async def test_annuler_avant_la_seance_rembourse(client, stripe_ok, database, monkeypatch):
    rembourses = []

    async def faux_remboursement(payment_intent_id: str) -> dict[str, object]:
        rembourses.append(payment_intent_id)
        return {"id": "re_1", "status": "succeeded"}

    monkeypatch.setattr(bookings_router, "refund_payment", faux_remboursement)

    _, ana, booking = await demande_acceptee(client, database)

    await client.post(
        f"{BASE}/create-intent",
        json={"booking_id": booking["id"]},
        headers=ana["headers"],
    )
    # Le webhook Stripe marquerait le paiement abouti : on le simule.
    await database.payments.update_one(
        {"payment_intent_id": "pi_test_123"}, {"$set": {"status": "succeeded"}}
    )

    annulation = await client.post(
        f"/api/v1/bookings/{booking['id']}/cancel", headers=ana["headers"]
    )

    assert annulation.status_code == 200
    assert rembourses == ["pi_test_123"]

    paiement = await database.payments.find_one({"payment_intent_id": "pi_test_123"})
    assert paiement["status"] == "refunded"


async def test_un_remboursement_impossible_conserve_la_demande(
    client, stripe_ok, database, monkeypatch
):
    """Perdre sa séance ET son argent serait le pire des cas : la demande tient."""
    from fastapi import HTTPException

    async def remboursement_en_panne(payment_intent_id: str) -> dict[str, object]:
        raise HTTPException(status_code=502, detail="Stripe injoignable")

    monkeypatch.setattr(bookings_router, "refund_payment", remboursement_en_panne)

    _, ana, booking = await demande_acceptee(client, database)

    await client.post(
        f"{BASE}/create-intent",
        json={"booking_id": booking["id"]},
        headers=ana["headers"],
    )
    await database.payments.update_one(
        {"payment_intent_id": "pi_test_123"}, {"$set": {"status": "succeeded"}}
    )

    annulation = await client.post(
        f"/api/v1/bookings/{booking['id']}/cancel", headers=ana["headers"]
    )

    assert annulation.status_code == 502

    liste = await client.get(
        "/api/v1/bookings", params={"direction": "sent"}, headers=ana["headers"]
    )
    assert liste.json()["items"][0]["status"] == "accepted"


async def test_webhook_refuse_sans_secret_configure(client):
    response = await client.post(f"{BASE}/webhook", content=b"{}")
    assert response.status_code == 503


async def test_une_intention_ouverte_est_reutilisee(client, monkeypatch, database):
    """Revenir sur l'écran de paiement ne doit pas empiler les intentions.

    Deux intentions ouvertes pour une même séance, c'est un risque de double débit.
    """
    appels = {"create": 0}

    async def compte_les_creations(
        amount: float,
        metadata: dict[str, str],
        destination_account: str | None = None,
        application_fee: float | None = None,
    ) -> dict[str, object]:
        appels["create"] += 1
        return {
            "id": f"pi_{appels['create']}",
            "client_secret": f"pi_{appels['create']}_secret",
            "amount": amount,
            "currency": "EUR",
        }

    async def intention_encore_ouverte(payment_intent_id: str) -> dict[str, object]:
        return {
            "id": payment_intent_id,
            "client_secret": f"{payment_intent_id}_secret",
            "amount": 25.0,
            "currency": "EUR",
            "status": "requires_payment_method",
        }

    monkeypatch.setattr(payments_router, "create_payment_intent", compte_les_creations)
    monkeypatch.setattr(payments_router, "retrieve_payment_intent", intention_encore_ouverte)

    _, ana, booking = await demande_acceptee(client, database)

    premiere = await client.post(
        f"{BASE}/create-intent",
        json={"booking_id": booking["id"]},
        headers=ana["headers"],
    )
    seconde = await client.post(
        f"{BASE}/create-intent",
        json={"booking_id": booking["id"]},
        headers=ana["headers"],
    )

    assert premiere.json()["client_secret"] == seconde.json()["client_secret"]
    assert appels["create"] == 1

    historique = await client.get(f"{BASE}/history", headers=ana["headers"])
    assert historique.json()["total"] == 1


async def test_une_intention_perimee_est_remplacee(client, monkeypatch, database):
    appels = {"create": 0}

    async def compte_les_creations(
        amount: float,
        metadata: dict[str, str],
        destination_account: str | None = None,
        application_fee: float | None = None,
    ) -> dict[str, object]:
        appels["create"] += 1
        return {
            "id": f"pi_{appels['create']}",
            "client_secret": f"pi_{appels['create']}_secret",
            "amount": amount,
            "currency": "EUR",
        }

    async def intention_annulee(payment_intent_id: str) -> dict[str, object]:
        return {
            "id": payment_intent_id,
            "client_secret": f"{payment_intent_id}_secret",
            "amount": 25.0,
            "currency": "EUR",
            "status": "canceled",
        }

    monkeypatch.setattr(payments_router, "create_payment_intent", compte_les_creations)
    monkeypatch.setattr(payments_router, "retrieve_payment_intent", intention_annulee)

    _, ana, booking = await demande_acceptee(client, database)

    for _ in range(2):
        await client.post(
            f"{BASE}/create-intent",
            json={"booking_id": booking["id"]},
            headers=ana["headers"],
        )

    # Une intention annulée chez Stripe n'est plus payable : il en faut une neuve.
    assert appels["create"] == 2
