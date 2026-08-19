"""Versements aux organisateurs : inscription Stripe Connect et état du compte."""

import pytest

from app.routers import payouts as payouts_router
from tests.conftest import register

BASE = "/api/v1/payouts"


@pytest.fixture
def stripe_connect(monkeypatch):
    """Double de Stripe Connect, qui compte les créations de compte."""
    appels = {"comptes": 0, "liens": 0}

    async def creer_compte(email: str, full_name: str) -> str:
        appels["comptes"] += 1
        return f"acct_{appels['comptes']}"

    async def creer_lien(account_id: str, return_url: str) -> str:
        appels["liens"] += 1
        return f"https://connect.stripe.test/{account_id}?retour={return_url}"

    monkeypatch.setattr(payouts_router, "create_connected_account", creer_compte)
    monkeypatch.setattr(payouts_router, "create_onboarding_link", creer_lien)
    return appels


async def test_statut_exige_une_authentification(client):
    assert (await client.get(f"{BASE}/status")).status_code == 401


async def test_un_compte_neuf_n_a_pas_de_versements(client):
    session = await register(client)

    response = await client.get(f"{BASE}/status", headers=session["headers"])

    assert response.status_code == 200
    assert response.json()["connected"] is False
    assert response.json()["payouts_enabled"] is False


async def test_l_inscription_cree_le_compte_et_le_conserve(client, stripe_connect, database):
    session = await register(client)

    response = await client.post(f"{BASE}/onboarding", headers=session["headers"])

    assert response.status_code == 200
    assert response.json()["url"].startswith("https://connect.stripe.test/acct_1")

    utilisateur = await database.users.find_one({"email": "jean@exemple.com"})
    assert utilisateur["stripe_account_id"] == "acct_1"
    assert utilisateur["stripe_payouts_enabled"] is False


async def test_un_second_appel_ne_recree_pas_de_compte(client, stripe_connect):
    """Le lien expire vite : on en refabrique un, mais jamais un compte de plus."""
    session = await register(client)

    await client.post(f"{BASE}/onboarding", headers=session["headers"])
    await client.post(f"{BASE}/onboarding", headers=session["headers"])

    assert stripe_connect["comptes"] == 1
    assert stripe_connect["liens"] == 2


async def test_le_statut_se_resynchronise_depuis_stripe(client, stripe_connect, monkeypatch, database):
    session = await register(client)
    await client.post(f"{BASE}/onboarding", headers=session["headers"])

    async def compte_verifie(account_id: str) -> dict[str, object]:
        return {
            "id": account_id,
            "details_submitted": True,
            "payouts_enabled": True,
            "charges_enabled": True,
        }

    monkeypatch.setattr(payouts_router, "retrieve_account_state", compte_verifie)

    response = await client.get(f"{BASE}/status", headers=session["headers"])

    assert response.json()["payouts_enabled"] is True

    # L'état est persisté : les paiements s'appuient dessus sans rappeler Stripe.
    utilisateur = await database.users.find_one({"email": "jean@exemple.com"})
    assert utilisateur["stripe_payouts_enabled"] is True


async def test_stripe_injoignable_conserve_le_dernier_etat_connu(
    client, stripe_connect, monkeypatch, database
):
    session = await register(client)
    await client.post(f"{BASE}/onboarding", headers=session["headers"])
    await database.users.update_one(
        {"email": "jean@exemple.com"}, {"$set": {"stripe_payouts_enabled": True}}
    )

    async def stripe_muet(account_id: str) -> None:
        return None

    monkeypatch.setattr(payouts_router, "retrieve_account_state", stripe_muet)

    response = await client.get(f"{BASE}/status", headers=session["headers"])

    # Mieux vaut un état daté qu'une erreur : l'écran Profil reste utilisable.
    assert response.status_code == 200
    assert response.json()["payouts_enabled"] is True


async def test_le_profil_expose_l_etat_des_versements(client, database):
    session = await register(client)

    avant = await client.get("/api/v1/auth/me", headers=session["headers"])
    assert avant.json()["payouts_enabled"] is False

    await database.users.update_one(
        {"email": "jean@exemple.com"}, {"$set": {"stripe_payouts_enabled": True}}
    )

    apres = await client.get("/api/v1/auth/me", headers=session["headers"])
    assert apres.json()["payouts_enabled"] is True
