"""Lectures composées, partagées entre plusieurs routeurs."""

from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.serializers import serialize_booking


async def load_users(
    database: AsyncIOMotorDatabase,
    user_ids: list[ObjectId],
) -> dict[str, dict[str, Any]]:
    """Charge plusieurs utilisateurs en une requête, indexés par identifiant."""
    if not user_ids:
        return {}

    cursor = database.users.find({"_id": {"$in": user_ids}})
    return {str(user["_id"]): user async for user in cursor}


async def expand_booking(
    database: AsyncIOMotorDatabase,
    document: dict[str, Any],
) -> dict[str, Any]:
    users = await load_users(
        database,
        [
            uid
            for uid in (document.get("requester_id"), document.get("partner_id"))
            if isinstance(uid, ObjectId)
        ],
    )
    return serialize_booking(
        document,
        users.get(str(document.get("requester_id"))),
        users.get(str(document.get("partner_id"))),
    )


async def expand_bookings(
    database: AsyncIOMotorDatabase,
    documents: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Version groupée : une seule requête utilisateurs pour toute la liste."""
    needed: list[ObjectId] = []
    for document in documents:
        needed.extend(
            uid
            for uid in (document.get("requester_id"), document.get("partner_id"))
            if isinstance(uid, ObjectId)
        )

    users = await load_users(database, list({str(uid): uid for uid in needed}.values()))

    return [
        serialize_booking(
            document,
            users.get(str(document.get("requester_id"))),
            users.get(str(document.get("partner_id"))),
        )
        for document in documents
    ]


async def refresh_user_rating(database: AsyncIOMotorDatabase, user_id: ObjectId) -> None:
    """Recalcule la note moyenne d'un partenaire à partir des avis reçus.

    Un avis porte sur une demande : la personne notée est le partenaire, jamais
    celui qui a réservé.
    """
    booking_ids = [
        document["_id"]
        async for document in database.bookings.find({"partner_id": user_id}, {"_id": 1})
    ]
    if not booking_ids:
        return

    ratings = [
        int(review.get("rating", 0))
        async for review in database.reviews.find(
            {"booking_id": {"$in": booking_ids}}, {"rating": 1}
        )
    ]
    ratings = [rating for rating in ratings if 1 <= rating <= 5]

    await database.users.update_one(
        {"_id": user_id},
        {
            "$set": {
                "average_rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
                "ratings_count": len(ratings),
            }
        },
    )
