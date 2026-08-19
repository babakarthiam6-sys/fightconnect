"""Lectures composées, partagées entre plusieurs routeurs."""

from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.serializers import serialize_sparring


async def load_users(
    database: AsyncIOMotorDatabase,
    user_ids: list[ObjectId],
) -> dict[str, dict[str, Any]]:
    """Charge plusieurs utilisateurs en une requête, indexés par identifiant."""
    if not user_ids:
        return {}

    cursor = database.users.find({"_id": {"$in": user_ids}})
    return {str(user["_id"]): user async for user in cursor}


async def expand_sparring(
    database: AsyncIOMotorDatabase,
    document: dict[str, Any],
) -> dict[str, Any]:
    participant_ids = list(document.get("participant_ids", []))
    creator_id = document.get("creator_id")

    users = await load_users(
        database,
        [uid for uid in [*participant_ids, creator_id] if isinstance(uid, ObjectId)],
    )

    participants = [users[str(uid)] for uid in participant_ids if str(uid) in users]
    creator = users.get(str(creator_id)) if creator_id else None

    return serialize_sparring(document, creator, participants)


async def expand_sparrings(
    database: AsyncIOMotorDatabase,
    documents: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Version groupée : une seule requête utilisateurs pour toute la liste."""
    needed: list[ObjectId] = []
    for document in documents:
        needed.extend(uid for uid in document.get("participant_ids", []) if isinstance(uid, ObjectId))
        creator_id = document.get("creator_id")
        if isinstance(creator_id, ObjectId):
            needed.append(creator_id)

    users = await load_users(database, list({str(uid): uid for uid in needed}.values()))

    expanded = []
    for document in documents:
        participants = [
            users[str(uid)] for uid in document.get("participant_ids", []) if str(uid) in users
        ]
        creator = users.get(str(document.get("creator_id")))
        expanded.append(serialize_sparring(document, creator, participants))
    return expanded


async def refresh_user_rating(database: AsyncIOMotorDatabase, user_id: ObjectId) -> None:
    """Recalcule la note moyenne d'un organisateur à partir des avis reçus.

    Les avis portent sur un sparring : l'organisateur est donc la personne notée.
    """
    sparring_ids = [
        document["_id"] async for document in database.sparrings.find({"creator_id": user_id}, {"_id": 1})
    ]
    if not sparring_ids:
        return

    ratings = [
        int(review.get("rating", 0))
        async for review in database.reviews.find({"sparring_id": {"$in": sparring_ids}}, {"rating": 1})
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
