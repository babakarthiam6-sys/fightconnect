import pytest

from app.routers import payments as payments_router
from tests.conftest import register, sparring_payload

BASE = "/api/v1/payments"


@pytest.fixture
def stripe_ok(monkeypatch):
    """Simule un Stripe configuré et disponible."""

    async def fake_intent(amount: float, metadata: dict[str, str]) -> dict[str, object]:
        return {
            "id": "pi_test_123",
            "client_secret": "pi_test_123_secret",
            "amount": amount,
            "currency": "EUR",
        }

    monkeypatch.setattr(payments_router, "create_payment_intent", fake_intent)
    return fake_intent


async def create_paid_sparring(client, headers, price: float = 25):
    response = await client.post(
        "/api/v1/sparrings", json=sparring_payload(price=price), headers=headers
    )
    assert response.status_code == 201
    return response.json()


async def test_create_intent_exige_une_authentification(client):
    response = await client.post(f"{BASE}/create-intent", json={"sparring_id": "x"})
    assert response.status_code == 401


async def test_sans_cle_stripe_le_paiement_est_indisponible(client):
    organisateur = await register(client, "orga@exemple.com", "Ada")
    sparring = await create_paid_sparring(client, organisateur["headers"])
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


async def test_create_intent_renvoie_un_client_secret(client, stripe_ok):
    organisateur = await register(client, "orga@exemple.com", "Ada")
    sparring = await create_paid_sparring(client, organisateur["headers"])
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


async def test_un_sparring_gratuit_ne_cree_pas_de_paiement(client, stripe_ok):
    organisateur = await register(client, "orga@exemple.com", "Ada")
    sparring = await create_paid_sparring(client, organisateur["headers"], price=0)
    acheteur = await register(client, "acheteur@exemple.com", "Léa")

    response = await client.post(
        f"{BASE}/create-intent",
        json={"sparring_id": sparring["id"]},
        headers=acheteur["headers"],
    )

    assert response.status_code == 400


async def test_historique_liste_les_paiements_du_seul_utilisateur(client, stripe_ok):
    organisateur = await register(client, "orga@exemple.com", "Ada")
    sparring = await create_paid_sparring(client, organisateur["headers"])
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


async def test_le_paiement_confirme_ouvre_l_acces_puis_est_consomme(client, stripe_ok, database):
    organisateur = await register(client, "orga@exemple.com", "Ada")
    sparring = await create_paid_sparring(client, organisateur["headers"])
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

    premiere = await client.post(
        f"/api/v1/sparrings/{sparring['id']}/join", headers=acheteur["headers"]
    )
    assert premiere.status_code == 200

    # Le paiement ayant été consommé, il ne peut pas servir une seconde fois.
    await client.post(f"/api/v1/sparrings/{sparring['id']}/cancel", headers=acheteur["headers"])
    seconde = await client.post(
        f"/api/v1/sparrings/{sparring['id']}/join", headers=acheteur["headers"]
    )
    assert seconde.status_code == 402


async def test_webhook_refuse_sans_secret_configure(client):
    response = await client.post(f"{BASE}/webhook", content=b"{}")
    assert response.status_code == 503


async def test_une_intention_ouverte_est_reutilisee(client, monkeypatch):
    """Revenir sur l'écran de paiement ne doit pas empiler les intentions.

    Deux intentions ouvertes pour une même place, c'est un risque de double débit.
    """
    appels = {"create": 0}

    async def compte_les_creations(amount: float, metadata: dict[str, str]) -> dict[str, object]:
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
    sparring = await create_paid_sparring(client, organisateur["headers"])
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


async def test_une_intention_perimee_est_remplacee(client, monkeypatch):
    appels = {"create": 0}

    async def compte_les_creations(amount: float, metadata: dict[str, str]) -> dict[str, object]:
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
    sparring = await create_paid_sparring(client, organisateur["headers"])
    acheteur = await register(client, "acheteur@exemple.com", "Léa")

    for _ in range(2):
        await client.post(
            f"{BASE}/create-intent",
            json={"sparring_id": sparring["id"]},
            headers=acheteur["headers"],
        )

    # Une intention annulée chez Stripe n'est plus payable : il en faut une neuve.
    assert appels["create"] == 2
