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


def sparring_payload(**overrides: Any) -> dict[str, Any]:
    payload = {
        "title": "Sparring boxe technique",
        "description": "Séance technique à intensité modérée, gants 14 oz obligatoires.",
        "location": "Paris 11e",
        "scheduled_at": "2030-05-12T18:30:00+00:00",
        "duration_minutes": 90,
        "level": "intermediate",
        "style": "boxing",
        "price": 25,
        "max_participants": 4,
    }
    payload.update(overrides)
    return payload
