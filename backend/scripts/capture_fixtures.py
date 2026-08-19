"""Régénère les fixtures de contrat consommées par les tests du mobile.

Les tests `frontend/__tests__/contract.test.ts` font tourner les normaliseurs de
l'application sur de **vraies** réponses de cette API. Ce script les capture.
À relancer dès qu'un schéma de sortie change, sans quoi le test de contrat
validerait un contrat périmé.

Prérequis : un MongoDB accessible et l'API lancée sur --api.

    uvicorn app.main:app --port 8123
    python scripts/capture_fixtures.py

Les données produites sont entièrement synthétiques.
"""

import argparse
import asyncio
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient

DEFAULT_OUTPUT = Path(__file__).resolve().parents[2] / "frontend/__tests__/fixtures/api-responses.json"
PASSWORD = "Sparring1"


async def capture(api: str, mongodb_uri: str, mongodb_db: str) -> dict:
    captured: dict[str, object] = {}

    async with httpx.AsyncClient(base_url=f"{api}/api/v1", timeout=20) as client:

        async def signup(email: str, first_name: str) -> dict:
            response = await client.post(
                "/auth/signup",
                json={
                    "email": email,
                    "password": PASSWORD,
                    "first_name": first_name,
                    "last_name": "Dupont",
                    "discharge_accepted": True,
                },
            )
            response.raise_for_status()
            return response.json()

        organisateur = await signup("ada@exemple.com", "Ada")
        captured["auth_signup"] = organisateur
        entete = {"Authorization": f"Bearer {organisateur['access_token']}"}

        captured["auth_login"] = (
            await client.post("/auth/login", json={"email": "ada@exemple.com", "password": PASSWORD})
        ).json()
        captured["auth_me"] = (await client.get("/auth/me", headers=entete)).json()

        quand = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()

        payante = await client.post(
            "/sparrings",
            headers=entete,
            json={
                "title": "Sparring boxe technique",
                "location": "Paris 11e",
                "description": "Séance technique à intensité modérée, gants 14 oz obligatoires.",
                "scheduled_at": quand,
                "duration_minutes": 90,
                "level": "intermediate",
                "style": "muay_thai",
                "price": 25.5,
                "max_participants": 4,
            },
        )
        payante.raise_for_status()
        captured["sparring_create"] = payante.json()

        gratuite = await client.post(
            "/sparrings",
            headers=entete,
            json={
                "title": "Sparring découverte gratuit",
                "location": "Lyon 3e",
                "description": "Séance d’initiation ouverte à toutes et tous, matériel prêté.",
                "scheduled_at": quand,
                "duration_minutes": 60,
                "level": "beginner",
                "style": "boxing",
                "price": 0,
                "max_participants": 6,
            },
        )
        gratuite.raise_for_status()
        gratuite_id = gratuite.json()["id"]

        partenaire = await signup("lea@exemple.com", "Léa")
        entete_partenaire = {"Authorization": f"Bearer {partenaire['access_token']}"}

        captured["sparring_join"] = (
            await client.post(f"/sparrings/{gratuite_id}/join", headers=entete_partenaire)
        ).json()
        captured["sparrings_list"] = (
            await client.get("/sparrings", params={"page": 1, "limit": 20})
        ).json()
        captured["sparring_detail"] = (await client.get(f"/sparrings/{gratuite_id}")).json()

        captured["moderation_review"] = (
            await client.post(
                "/moderation/reviews",
                headers=entete_partenaire,
                json={
                    "sparring_id": gratuite_id,
                    "rating": 5,
                    "comment": "Excellente séance, très pédagogue.",
                },
            )
        ).json()

        # Un avis volontairement injurieux, pour capturer la forme d'un signalement.
        captured["moderation_review_flagged"] = (
            await client.post(
                "/moderation/reviews",
                headers=entete,
                json={
                    "sparring_id": gratuite_id,
                    "rating": 1,
                    "comment": "Quel connard, séance dangereuse.",
                },
            )
        ).json()

        captured["sparring_reviews"] = (
            await client.get(f"/sparrings/{gratuite_id}/reviews")
        ).json()
        captured["moderation_user_risk"] = (
            await client.get(f"/moderation/user-risk/{partenaire['user']['id']}", headers=entete)
        ).json()
        captured["moderation_recommendations"] = (
            await client.get("/moderation/recommendations", headers=entete_partenaire)
        ).json()
        captured["revenue_stats"] = (await client.get("/revenue/stats", headers=entete)).json()

        # Stripe n'est pas sollicité ici : le paiement abouti est inséré
        # directement, uniquement pour capturer la forme de l'historique.
        database = AsyncIOMotorClient(mongodb_uri)[mongodb_db]
        await database.payments.insert_one(
            {
                "user_id": ObjectId(partenaire["user"]["id"]),
                "sparring_id": ObjectId(captured["sparring_create"]["id"]),
                "sparring_title": captured["sparring_create"]["title"],
                "payment_intent_id": "pi_capture_1",
                "amount": 25.5,
                "currency": "EUR",
                "status": "succeeded",
                "consumed": False,
                "created_at": datetime.now(timezone.utc),
            }
        )
        captured["payments_history"] = (
            await client.get("/payments/history", headers=entete_partenaire)
        ).json()

        mauvais = await client.post(
            "/auth/login", json={"email": "ada@exemple.com", "password": "Faux1234"}
        )
        captured["error_401"] = {"status": mauvais.status_code, "body": mauvais.json()}

        invalide = await client.post("/auth/signup", json={"email": "pas-un-email", "password": "x"})
        captured["error_422"] = {"status": invalide.status_code, "body": invalide.json()}

    return captured


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", default="http://127.0.0.1:8123")
    parser.add_argument("--mongodb-uri", default="mongodb://127.0.0.1:27017")
    parser.add_argument("--mongodb-db", default="fixtures")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    captured = asyncio.run(capture(args.api, args.mongodb_uri, args.mongodb_db))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        json.dump(captured, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    print(f"{len(captured)} réponses capturées dans {args.output}")


if __name__ == "__main__":
    main()
