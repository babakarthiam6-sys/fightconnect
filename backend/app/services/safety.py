"""Blocages et suspensions : qui ne doit plus croiser qui.

Un blocage vaut dans les deux sens. Celui qui bloque ne veut plus être
contacté, et celui qui est bloqué ne doit pas pouvoir contourner le blocage en
le retrouvant par la recherche ou par une annonce. Chacun disparaît donc de ce
que l'autre voit, et aucun des deux ne peut plus écrire à l'autre, le réserver
ni répondre à ses annonces.

Celui qui est bloqué n'en est jamais averti : les refus qu'il rencontre
ressemblent à ceux d'un partenaire indisponible. Lui dire « vous avez été
bloqué » inviterait à recréer un compte pour insister.
"""

from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

# Filtre à ajouter à toute requête qui liste des profils : un compte suspendu
# n'apparaît plus nulle part.
NOT_SUSPENDED: dict[str, Any] = {"suspended": {"$ne": True}}


async def blocked_by(database: AsyncIOMotorDatabase, user_id: ObjectId) -> set[ObjectId]:
    """Ceux que cette personne a bloqués."""
    return {
        block["blocked_id"]
        async for block in database.blocks.find({"blocker_id": user_id}, {"blocked_id": 1})
    }


async def hidden_from(database: AsyncIOMotorDatabase, user_id: ObjectId) -> set[ObjectId]:
    """Ceux que cette personne ne doit plus voir : bloqués par elle, ou l'ayant bloquée."""
    hidden: set[ObjectId] = set()
    async for block in database.blocks.find(
        {"$or": [{"blocker_id": user_id}, {"blocked_id": user_id}]},
        {"blocker_id": 1, "blocked_id": 1},
    ):
        hidden.add(block["blocked_id"] if block["blocker_id"] == user_id else block["blocker_id"])
    return hidden


async def has_blocked(database: AsyncIOMotorDatabase, blocker: ObjectId, blocked: ObjectId) -> bool:
    return await database.blocks.find_one({"blocker_id": blocker, "blocked_id": blocked}) is not None


async def is_blocked_between(database: AsyncIOMotorDatabase, a: ObjectId, b: ObjectId) -> bool:
    """Vrai si l'une des deux personnes a bloqué l'autre."""
    return (
        await database.blocks.find_one(
            {
                "$or": [
                    {"blocker_id": a, "blocked_id": b},
                    {"blocker_id": b, "blocked_id": a},
                ]
            }
        )
        is not None
    )
