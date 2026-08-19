"""Avis, modération IA et recommandations."""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, status

from app.dependencies import CurrentUser, Database
from app.repositories import expand_sparrings, refresh_user_rating
from app.schemas import ReviewCreate, ReviewOut, SparringList, UserRiskOut
from app.serializers import serialize_review, to_object_id
from app.services.moderation import moderate_comment, risk_level_from

router = APIRouter(prefix="/moderation", tags=["moderation"])


@router.post("/reviews", response_model=ReviewOut, status_code=status.HTTP_201_CREATED)
async def create_review(
    payload: ReviewCreate,
    database: Database,
    current_user: CurrentUser,
) -> dict[str, Any]:
    sparring_id = to_object_id(payload.sparring_id)
    if sparring_id is None:
        raise HTTPException(status_code=404, detail="Sparring introuvable.")

    sparring = await database.sparrings.find_one({"_id": sparring_id})
    if sparring is None:
        raise HTTPException(status_code=404, detail="Sparring introuvable.")

    user_id = current_user["_id"]
    is_participant = user_id in sparring.get("participant_ids", [])
    is_creator = sparring.get("creator_id") == user_id
    if not (is_participant or is_creator):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seuls les participants peuvent laisser un avis.",
        )

    if await database.reviews.find_one({"sparring_id": sparring_id, "author_id": user_id}):
        raise HTTPException(status_code=409, detail="Vous avez déjà laissé un avis.")

    verdict = await moderate_comment(payload.comment)

    document = {
        "sparring_id": sparring_id,
        "author_id": user_id,
        "rating": payload.rating,
        "comment": payload.comment.strip(),
        "flagged": verdict.flagged,
        "flag_reason": verdict.reason,
        "moderation_score": verdict.score,
        "created_at": datetime.now(timezone.utc),
    }
    result = await database.reviews.insert_one(document)
    document["_id"] = result.inserted_id

    # Un avis signalé ne compte pas dans la note de l'organisateur : sinon un
    # commentaire abusif pourrait faire chuter sa moyenne.
    if not verdict.flagged and sparring.get("creator_id"):
        await refresh_user_rating(database, sparring["creator_id"])

    return serialize_review(document, current_user)


@router.get("/user-risk/{user_id}", response_model=UserRiskOut)
async def user_risk(user_id: str, database: Database, current_user: CurrentUser) -> dict[str, Any]:
    object_id = to_object_id(user_id)
    if object_id is None:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")

    if await database.users.find_one({"_id": object_id}) is None:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")

    total = await database.reviews.count_documents({"author_id": object_id})
    flagged = await database.reviews.count_documents({"author_id": object_id, "flagged": True})
    level, score, reasons = risk_level_from(flagged, total)

    return {"user_id": user_id, "risk_level": level, "score": score, "reasons": reasons}


@router.get("/recommendations", response_model=SparringList)
async def recommendations(database: Database, current_user: CurrentUser) -> dict[str, Any]:
    """Séances suggérées, à partir des disciplines déjà pratiquées.

    Heuristique volontairement simple et lisible : on privilégie les disciplines
    auxquelles l'utilisateur a déjà participé, puis on complète avec les séances
    ouvertes les plus proches dans le temps.
    """
    user_id = current_user["_id"]

    joined = [
        document async for document in database.sparrings.find({"participant_ids": user_id})
    ]
    preferred_styles = {document.get("style") for document in joined if document.get("style")}
    excluded_ids = [document["_id"] for document in joined]

    base_query: dict[str, Any] = {
        "creator_id": {"$ne": user_id},
        "_id": {"$nin": excluded_ids},
        "status": {"$nin": ["cancelled", "completed"]},
    }

    suggestions: list[dict[str, Any]] = []
    if preferred_styles:
        cursor = database.sparrings.find(
            {**base_query, "style": {"$in": list(preferred_styles)}}
        ).sort("scheduled_at", 1).limit(10)
        suggestions = [document async for document in cursor]

    if len(suggestions) < 10:
        seen = {document["_id"] for document in suggestions}
        cursor = database.sparrings.find(base_query).sort("scheduled_at", 1).limit(10)
        async for document in cursor:
            if document["_id"] not in seen:
                suggestions.append(document)
            if len(suggestions) >= 10:
                break

    items = await expand_sparrings(database, suggestions)
    return {"items": items, "total": len(items), "page": 1, "limit": len(items)}
