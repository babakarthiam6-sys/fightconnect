"""Contrôle d'accès administrateur.

Le droit admin vit dans la configuration du serveur (`admin_emails`), jamais en
base : un compte dont on prendrait le contrôle ne peut pas se promouvoir en
écrivant dans son propre document.
"""

import pytest

from app.config import Settings
from tests.conftest import make_partner, register


def _settings_avec_admin(*emails: str) -> Settings:
    return Settings(_env_file=None, admin_emails=",".join(emails))


@pytest.mark.asyncio
async def test_user_risk_est_refuse_a_un_utilisateur_ordinaire(client, monkeypatch):
    """Sans droit admin, la route de risque ne doit rien révéler — pas même
    qu'elle existe (404, pas 403)."""
    import app.dependencies as deps

    monkeypatch.setattr(deps, "get_settings", lambda: _settings_avec_admin())

    lambda_user = await register(client, email="curieux@exemple.com", first_name="Cu")
    cible = await make_partner(client, email="cible@exemple.com", first_name="Ci")

    reponse = await client.get(
        f"/api/v1/moderation/user-risk/{cible['user']['id']}",
        headers=lambda_user["headers"],
    )
    assert reponse.status_code == 404


@pytest.mark.asyncio
async def test_user_risk_est_accessible_a_un_admin(client, monkeypatch):
    import app.dependencies as deps

    monkeypatch.setattr(
        deps, "get_settings", lambda: _settings_avec_admin("chef@exemple.com")
    )

    admin = await register(client, email="chef@exemple.com", first_name="Chef")
    cible = await make_partner(client, email="cible@exemple.com", first_name="Ci")

    reponse = await client.get(
        f"/api/v1/moderation/user-risk/{cible['user']['id']}",
        headers=admin["headers"],
    )
    assert reponse.status_code == 200
    assert reponse.json()["user_id"] == cible["user"]["id"]


@pytest.mark.asyncio
async def test_la_route_admin_exige_un_jeton(client):
    """Sans authentification du tout, c'est 401, avant même le contrôle admin."""
    reponse = await client.get("/api/v1/moderation/user-risk/whatever")
    assert reponse.status_code == 401


def test_appartenance_admin_est_insensible_casse_et_espaces():
    settings = _settings_avec_admin(" Chef@Exemple.COM ")
    assert settings.is_admin_email("chef@exemple.com") is True
    assert settings.is_admin_email("CHEF@exemple.com") is True
    assert settings.is_admin_email("autre@exemple.com") is False
    assert settings.is_admin_email(None) is False


def test_sans_admin_configure_personne_n_est_admin():
    settings = _settings_avec_admin()
    assert settings.is_admin_email("chef@exemple.com") is False
    assert settings.admin_email_list == []
