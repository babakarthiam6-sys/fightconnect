import pytest

from app.routers import payments as payments_router
from app.routers import sparrings as sparrings_router
from tests.conftest import register, sparring_payload

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
    """Simule un organisateur ayant terminé son inscription Stripe.

    Sans versements actifs, la réservation est refusée en amont : la plateforme
    refuse d'encaisser pour quelqu'un qu'elle ne peut pas payer.
    """
    await database.users.update_one(
        {"email": email},
        {"$set": {"stripe_account_id": "acct_test_1", "stripe_payouts_enabled": True}},
    )


async def create_paid_sparring(client, headers, price: float = 25, database=None, email=None):
    response = await client.post(
        "/api/v1/sparrings", json=sparring_payload(price=price), headers=headers
    )
    assert response.status_code == 201
    if database is not None and email is not None:
        await activer_versements(database, email)
    return response.json()


async def test_create_intent_exige_une_authentification(client):
    response = await client.post(f"{BASE}/create-intent", json={"sparring_id": "x"})
    assert response.status_code == 401


async def test_sans_cle_stripe_le_paiement_est_indisponible(client, database):
    organisateur = await register(client, "orga@exemple.com", "Ada")
    sparring = await create_paid_sparring(
        client, organisateur["headers"], database=database, email="orga@exemple.com"
    )
    acheteur = await register(client, "acheteur@exemple.com", "Léa")

    response = await client.post(
        f"{BASE}/create-intent",
        json={"sparring_id": sparring["id"]},
        headers=acheteur["headers"],
    )

    # 503 et non 500 : le service est correctement configuré côté code, il
    # manque seulement la clé.
    assert response.status_code == 503
    assert "STRIPE_SECRET_KEY" in response.json()["detail"]


async def test_create_intent_renvoie_un_client_secret(client, stripe_ok, database):
    organisateur = await register(client, "orga@exemple.com", "Ada")
    sparring = await create_paid_sparring(
        client, organisateur["headers"], database=database, email="orga@exemple.com"
    )
    acheteur = await register(client, "acheteur@exemple.com", "Léa")

    response = await client.post(
        f"{BASE}/create-intent",
        json={"sparring_id": sparring["id"]},
        headers=acheteur["headers"],
    )

    assert response.status_code == 200
    body = response.json()
    assert body["client_secret"] == "pi_test_123_secret"
    assert body["amount"] == 25


async def test_un_sparring_gratuit_ne_cree_pas_de_paiement(client, stripe_ok, database):
    organisateur = await register(client, "orga@exemple.com", "Ada")
    sparring = await create_paid_sparring(
        client, organisateur["headers"], price=0, database=database, email="orga@exemple.com"
    )
    acheteur = await register(client, "acheteur@exemple.com", "Léa")

    response = await client.post(
        f"{BASE}/create-intent",
        json={"sparring_id": sparring["id"]},
        headers=acheteur["headers"],
    )

    assert response.status_code == 400


async def test_historique_liste_les_paiements_du_seul_utilisateur(client, stripe_ok, database):
    organisateur = await register(client, "orga@exemple.com", "Ada")
    sparring = await create_paid_sparring(
        client, organisateur["headers"], database=database, email="orga@exemple.com"
    )
    acheteur = await register(client, "acheteur@exemple.com", "Léa")
    tiers = await register(client, "tiers@exemple.com", "Tiers")

    await client.post(
        f"{BASE}/create-intent",
        json={"sparring_id": sparring["id"]},
        headers=acheteur["headers"],
    )

    mien = await client.get(f"{BASE}/history", headers=acheteur["headers"])
    autre = await client.get(f"{BASE}/history", headers=tiers["headers"])

    assert mien.json()["total"] == 1
    assert mien.json()["items"][0]["sparring_title"] == "Sparring boxe technique"
    assert mien.json()["items"][0]["status"] == "pending"
    assert autre.json()["total"] == 0


async def test_le_paiement_confirme_ouvre_l_acces(client, stripe_ok, database):
    organisateur = await register(client, "orga@exemple.com", "Ada")
    sparring = await create_paid_sparring(
        client, organisateur["headers"], database=database, email="orga@exemple.com"
    )
    acheteur = await register(client, "acheteur@exemple.com", "Léa")

    await client.post(
        f"{BASE}/create-intent",
        json={"sparring_id": sparring["id"]},
        headers=acheteur["headers"],
    )
    # Le webhook Stripe marquerait le paiement abouti : on le simule.
    await database.payments.update_one(
        {"payment_intent_id": "pi_test_123"}, {"$set": {"status": "succeeded"}}
    )

    rejoint = await client.post(
        f"/api/v1/sparrings/{sparring['id']}/join", headers=acheteur["headers"]
    )
    assert rejoint.status_code == 200


async def test_annuler_avant_la_seance_rembourse(client, stripe_ok, database, monkeypatch):
    """Annuler rend l'argent, et la place ne peut pas être reprise sans repayer."""
    rembourses = []

    async def faux_remboursement(payment_intent_id: str) -> dict[str, object]:
        rembourses.append(payment_intent_id)
        return {"id": "re_1", "status": "succeeded"}

    monkeypatch.setattr(sparrings_router, "refund_payment", faux_remboursement)

    organisateur = await register(client, "orga@exemple.com", "Ada")
    sparring = await create_paid_sparring(
        client, organisateur["headers"], database=database, email="orga@exemple.com"
    )
    acheteur = await register(client, "acheteur@exemple.com", "Léa")

    await client.post(
        f"{BASE}/create-intent",
        json={"sparring_id": sparring["id"]},
        headers=acheteur["headers"],
    )
    await database.payments.update_one(
        {"payment_intent_id": "pi_test_123"}, {"$set": {"status": "succeeded"}}
    )
    await client.post(f"/api/v1/sparrings/{sparring['id']}/join", headers=acheteur["headers"])

    annulation = await client.post(
        f"/api/v1/sparrings/{sparring['id']}/cancel", headers=acheteur["headers"]
    )

    assert annulation.status_code == 200
    assert rembourses == ["pi_test_123"]

    paiement = await database.payments.find_one({"payment_intent_id": "pi_test_123"})
    assert paiement["status"] == "refunded"

    # Le paiement remboursé ne rouvre plus la porte.
    retour = await client.post(
        f"/api/v1/sparrings/{sparring['id']}/join", headers=acheteur["headers"]
    )
    assert retour.status_code == 402


async def test_un_remboursement_impossible_conserve_la_place(
    client, stripe_ok, database, monkeypatch
):
    """Perdre sa place ET son argent serait le pire des cas : on garde la place."""
    from fastapi import HTTPException

    async def remboursement_en_panne(payment_intent_id: str) -> dict[str, object]:
        raise HTTPException(status_code=502, detail="Stripe injoignable")

    monkeypatch.setattr(sparrings_router, "refund_payment", remboursement_en_panne)

    organisateur = await register(client, "orga@exemple.com", "Ada")
    sparring = await create_paid_sparring(
        client, organisateur["headers"], database=database, email="orga@exemple.com"
    )
    acheteur = await register(client, "acheteur@exemple.com", "Léa")

    await client.post(
        f"{BASE}/create-intent",
        json={"sparring_id": sparring["id"]},
        headers=acheteur["headers"],
    )
    await database.payments.update_one(
        {"payment_intent_id": "pi_test_123"}, {"$set": {"status": "succeeded"}}
    )
    await client.post(f"/api/v1/sparrings/{sparring['id']}/join", headers=acheteur["headers"])

    annulation = await client.post(
        f"/api/v1/sparrings/{sparring['id']}/cancel", headers=acheteur["headers"]
    )

    assert annulation.status_code == 502

    fiche = await client.get(f"/api/v1/sparrings/{sparring['id']}")
    assert len(fiche.json()["participants"]) == 1


async def test_webhook_refuse_sans_secret_configure(client):
    response = await client.post(f"{BASE}/webhook", content=b"{}")
    assert response.status_code == 503


async def test_une_intention_ouverte_est_reutilisee(client, monkeypatch, database):
    """Revenir sur l'écran de paiement ne doit pas empiler les intentions.

    Deux intentions ouvertes pour une même place, c'est un risque de double débit.
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

    organisateur = await register(client, "orga@exemple.com", "Ada")
    sparring = await create_paid_sparring(
        client, organisateur["headers"], database=database, email="orga@exemple.com"
    )
    acheteur = await register(client, "acheteur@exemple.com", "Léa")

    premiere = await client.post(
        f"{BASE}/create-intent",
        json={"sparring_id": sparring["id"]},
        headers=acheteur["headers"],
    )
    seconde = await client.post(
        f"{BASE}/create-intent",
        json={"sparring_id": sparring["id"]},
        headers=acheteur["headers"],
    )

    assert premiere.json()["client_secret"] == seconde.json()["client_secret"]
    assert appels["create"] == 1

    historique = await client.get(f"{BASE}/history", headers=acheteur["headers"])
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

    organisateur = await register(client, "orga@exemple.com", "Ada")
    sparring = await create_paid_sparring(
        client, organisateur["headers"], database=database, email="orga@exemple.com"
    )
    acheteur = await register(client, "acheteur@exemple.com", "Léa")

    for _ in range(2):
        await client.post(
            f"{BASE}/create-intent",
            json={"sparring_id": sparring["id"]},
            headers=acheteur["headers"],
        )

    # Une intention annulée chez Stripe n'est plus payable : il en faut une neuve.
    assert appels["create"] == 2
