"""Régénère les fixtures de contrat consommées par les tests du mobile.

Les tests `frontend/__tests__/contract.test.ts` font tourner les normaliseurs de
l'application sur de **vraies** réponses de cette API. Ce script les capture.
À relancer dès qu'un schéma de sortie change, sans quoi le test de contrat
validerait un contrat périmé.

Par défaut l'API est montée en mémoire, sur une base simulée : aucun serveur à
lancer, aucun MongoDB à installer. C'est ce qui permet de régénérer les fixtures
depuis n'importe quel poste et depuis la CI. `--mongodb-uri` bascule sur un vrai
serveur quand on veut capturer contre le moteur réel.

    python scripts/capture_fixtures.py

Les données produites sont entièrement synthétiques.
"""

import argparse
import asyncio
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx
from bson import ObjectId

from app.database import get_database
from app.main import create_app

DEFAULT_OUTPUT = Path(__file__).resolve().parents[2] / "frontend/__tests__/fixtures/api-responses.json"
PASSWORD = "Sparring1"


def open_database(mongodb_uri: str | None, mongodb_db: str):
    if mongodb_uri:
        from motor.motor_asyncio import AsyncIOMotorClient

        return AsyncIOMotorClient(mongodb_uri)[mongodb_db]

    from mongomock_motor import AsyncMongoMockClient

    return AsyncMongoMockClient()[mongodb_db]


async def capture(mongodb_uri: str | None, mongodb_db: str) -> dict[str, Any]:
    captured: dict[str, Any] = {}
    database = open_database(mongodb_uri, mongodb_db)

    app = create_app()
    app.dependency_overrides[get_database] = lambda: database

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://capture/api/v1", timeout=20
    ) as client:

        async def signup(email: str, first_name: str) -> dict[str, Any]:
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

        luis = await signup("luis@exemple.com", "Luis")
        captured["auth_signup"] = luis
        entete_luis = {"Authorization": f"Bearer {luis['access_token']}"}

        captured["auth_login"] = (
            await client.post(
                "/auth/login", json={"email": "luis@exemple.com", "password": PASSWORD}
            )
        ).json()

        profil = await client.patch(
            "/auth/me",
            headers=entete_luis,
            json={
                "city": "Valence",
                "bio": "Boxeur amateur passionné, toujours prêt pour un bon sparring.",
                "style": "boxing",
                "level": "amateur",
                "weight_class": "middleweight",
                "height_cm": 178,
                "fights_count": 15,
                "experience_years": 5,
                "price_per_round": 20,
                "available": True,
            },
        )
        profil.raise_for_status()
        captured["auth_profile_update"] = profil.json()
        captured["auth_me"] = (await client.get("/auth/me", headers=entete_luis)).json()

        ana = await signup("ana@exemple.com", "Ana")
        entete_ana = {"Authorization": f"Bearer {ana['access_token']}"}

        captured["partners_list"] = (
            await client.get("/partners", params={"page": 1, "limit": 20}, headers=entete_ana)
        ).json()
        captured["partner_detail"] = (
            await client.get(f"/partners/{luis['user']['id']}", headers=entete_ana)
        ).json()

        quand = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        demande = await client.post(
            "/bookings",
            headers=entete_ana,
            json={"partner_id": luis["user"]["id"], "scheduled_at": quand, "rounds": 2},
        )
        demande.raise_for_status()
        captured["booking_create"] = demande.json()
        booking_id = demande.json()["id"]

        captured["booking_accept"] = (
            await client.post(f"/bookings/{booking_id}/accept", headers=entete_luis)
        ).json()
        captured["bookings_sent"] = (
            await client.get("/bookings", params={"direction": "sent"}, headers=entete_ana)
        ).json()
        captured["bookings_received"] = (
            await client.get("/bookings", params={"direction": "received"}, headers=entete_luis)
        ).json()

        # La séance doit avoir eu lieu pour qu'un avis soit recevable : on
        # avance l'horaire plutôt que d'attendre, puis on la clôture.
        await database.bookings.update_one(
            {"_id": ObjectId(booking_id)},
            {"$set": {"scheduled_at": datetime.now(timezone.utc) - timedelta(days=1)}},
        )
        captured["booking_complete"] = (
            await client.post(f"/bookings/{booking_id}/complete", headers=entete_ana)
        ).json()

        captured["moderation_review"] = (
            await client.post(
                "/moderation/reviews",
                headers=entete_ana,
                json={
                    "booking_id": booking_id,
                    "rating": 5,
                    "comment": "Excellente séance, très pédagogue.",
                },
            )
        ).json()

        # Un avis volontairement injurieux, pour capturer la forme d'un signalement.
        maria = await signup("maria@exemple.com", "Maria")
        entete_maria = {"Authorization": f"Bearer {maria['access_token']}"}
        autre = await client.post(
            "/bookings",
            headers=entete_maria,
            json={"partner_id": luis["user"]["id"], "scheduled_at": quand, "rounds": 1},
        )
        autre_id = autre.json()["id"]
        await client.post(f"/bookings/{autre_id}/accept", headers=entete_luis)
        await database.bookings.update_one(
            {"_id": ObjectId(autre_id)},
            {"$set": {"scheduled_at": datetime.now(timezone.utc) - timedelta(days=1)}},
        )
        await client.post(f"/bookings/{autre_id}/complete", headers=entete_maria)

        captured["moderation_review_flagged"] = (
            await client.post(
                "/moderation/reviews",
                headers=entete_maria,
                json={
                    "booking_id": autre_id,
                    "rating": 1,
                    "comment": "Quel connard, séance dangereuse.",
                },
            )
        ).json()

        captured["booking_reviews"] = (
            await client.get(f"/bookings/{booking_id}/reviews")
        ).json()
        captured["moderation_user_risk"] = (
            await client.get(
                f"/moderation/user-risk/{maria['user']['id']}", headers=entete_luis
            )
        ).json()
        captured["moderation_recommendations"] = (
            await client.get("/moderation/recommendations", headers=entete_ana)
        ).json()
        captured["revenue_stats"] = (
            await client.get("/revenue/stats", headers=entete_luis)
        ).json()
        captured["payouts_status"] = (
            await client.get("/payouts/status", headers=entete_luis)
        ).json()

        # Stripe n'est pas sollicité ici : le paiement abouti est inséré
        # directement, uniquement pour capturer la forme de l'historique.
        await database.payments.insert_one(
            {
                "user_id": ObjectId(ana["user"]["id"]),
                "booking_id": ObjectId(booking_id),
                "partner_name": "Luis Dupont",
                "payment_intent_id": "pi_capture_1",
                "amount": 40.0,
                "currency": "EUR",
                "status": "succeeded",
                "consumed": False,
                "created_at": datetime.now(timezone.utc),
            }
        )
        captured["payments_history"] = (
            await client.get("/payments/history", headers=entete_ana)
        ).json()

        mauvais = await client.post(
            "/auth/login", json={"email": "luis@exemple.com", "password": "Faux1234"}
        )
        captured["error_401"] = {"status": mauvais.status_code, "body": mauvais.json()}

        invalide = await client.post("/auth/signup", json={"email": "pas-un-email", "password": "x"})
        captured["error_422"] = {"status": invalide.status_code, "body": invalide.json()}

    return captured


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--mongodb-uri",
        default=None,
        help="Capture contre un vrai MongoDB. Par défaut : base simulée en mémoire.",
    )
    parser.add_argument("--mongodb-db", default="fixtures")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    captured = asyncio.run(capture(args.mongodb_uri, args.mongodb_db))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        json.dump(captured, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    print(f"{len(captured)} réponses capturées dans {args.output}")


if __name__ == "__main__":
    main()
