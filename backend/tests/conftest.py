"""Fixtures partagées : base Mongo en mémoire et client HTTP asynchrone."""

from typing import Any

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

from app.database import get_database
from app.main import create_app


@pytest_asyncio.fixture
async def database():
    """Base en mémoire : aucun serveur MongoDB n'est requis pour les tests."""
    client = AsyncMongoMockClient()
    return client["fightconnect_test"]


@pytest_asyncio.fixture
async def client(database) -> AsyncClient:
    app = create_app()
    # Le lifespan (connexion Mongo réelle) n'est pas exécuté par ASGITransport :
    # seule la dépendance est remplacée.
    app.dependency_overrides[get_database] = lambda: database

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
        yield http


async def register(
    http: AsyncClient,
    email: str = "jean@exemple.com",
    first_name: str = "Jean",
) -> dict[str, Any]:
    """Crée un compte et renvoie le jeton, l'utilisateur et l'en-tête prêt à l'emploi."""
    response = await http.post(
        "/api/v1/auth/signup",
        json={
            "email": email,
            "password": "Sparring1",
            "first_name": first_name,
            "last_name": "Dupont",
            "discharge_accepted": True,
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    return {
        "token": body["access_token"],
        "user": body["user"],
        "headers": {"Authorization": f"Bearer {body['access_token']}"},
    }


async def make_partner(
    http: AsyncClient,
    email: str = "luis@exemple.com",
    first_name: str = "Luis",
    **profile: Any,
) -> dict[str, Any]:
    """Crée un compte et le rend réservable : profil sportif complet et disponible."""
    account = await register(http, email=email, first_name=first_name)

    payload = {
        "city": "Valence",
        "style": "boxing",
        "level": "amateur",
        "weight_class": "middleweight",
        "height_cm": 178,
        "fights_count": 15,
        "experience_years": 5,
        "price_per_round": 20,
        "bio": "Boxeur amateur, toujours prêt pour un bon sparring.",
        "available": True,
    }
    payload.update(profile)

    response = await http.patch("/api/v1/auth/me", json=payload, headers=account["headers"])
    assert response.status_code == 200, response.text
    account["user"] = response.json()
    return account


def booking_payload(partner_id: str, **overrides: Any) -> dict[str, Any]:
    payload = {
        "partner_id": partner_id,
        "scheduled_at": "2030-05-12T18:30:00+00:00",
        "rounds": 2,
    }
    payload.update(overrides)
    return payload
