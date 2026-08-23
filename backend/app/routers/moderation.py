"""Avis, modération IA et recommandations."""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, status

from app.i18n import t
from app.dependencies import CurrentUser, Database
from app.repositories import refresh_user_rating
from app.schemas import PartnerList, ReviewCreate, ReviewOut, UserRiskOut
from app.serializers import serialize_partner, serialize_review, to_object_id
from app.services.moderation import moderate_comment, risk_level_from

router = APIRouter(prefix="/moderation", tags=["moderation"])


@router.post("/reviews", response_model=ReviewOut, status_code=status.HTTP_201_CREATED)
async def create_review(
    payload: ReviewCreate,
    database: Database,
    current_user: CurrentUser,
) -> dict[str, Any]:
    booking_id = to_object_id(payload.booking_id)
    booking = await database.bookings.find_one({"_id": booking_id}) if booking_id else None
    if booking is None:
        raise HTTPException(status_code=404, detail=t("demande.introuvable"))

    user_id = current_user["_id"]

    # Seul celui qui a réservé note le partenaire : c'est lui qui a reçu la
    # prestation. Le sens inverse demanderait une seconde note, distincte, qui
    # n'existe pas encore.
    if booking.get("requester_id") != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=t("avis.pas_l_auteur"),
        )
    if booking.get("status") != "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("avis.trop_tot"),
        )

    if await database.reviews.find_one({"booking_id": booking["_id"], "author_id": user_id}):
        raise HTTPException(status_code=409, detail=t("avis.deja_donne"))

    verdict = await moderate_comment(payload.comment)

    document = {
        "booking_id": booking["_id"],
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

    await database.bookings.update_one({"_id": booking["_id"]}, {"$set": {"reviewed": True}})

    # Un avis signalé ne compte pas dans la note du partenaire : sinon un
    # commentaire abusif pourrait faire chuter sa moyenne.
    if not verdict.flagged and booking.get("partner_id"):
        await refresh_user_rating(database, booking["partner_id"])

    return serialize_review(document, current_user)


@router.get("/user-risk/{user_id}", response_model=UserRiskOut)
async def user_risk(user_id: str, database: Database, current_user: CurrentUser) -> dict[str, Any]:
    object_id = to_object_id(user_id)
    if object_id is None:
        raise HTTPException(status_code=404, detail=t("compte.introuvable"))

    if await database.users.find_one({"_id": object_id}) is None:
        raise HTTPException(status_code=404, detail=t("compte.introuvable"))

    total = await database.reviews.count_documents({"author_id": object_id})
    flagged = await database.reviews.count_documents({"author_id": object_id, "flagged": True})
    level, score, reasons = risk_level_from(flagged, total)

    return {"user_id": user_id, "risk_level": level, "score": score, "reasons": reasons}


@router.get("/recommendations", response_model=PartnerList)
async def recommendations(database: Database, current_user: CurrentUser) -> dict[str, Any]:
    """Partenaires suggérés.

    Heuristique volontairement simple et lisible : d'abord ceux qui pratiquent
    la même discipline dans la même ville, puis la même discipline ailleurs,
    puis n'importe quel profil disponible. On s'arrête dès qu'on en a dix.
    """
    user_id = current_user["_id"]

    presentable: dict[str, Any] = {
        "_id": {"$ne": user_id},
        "available": True,
        "style": {"$ne": None},
        "price_per_round": {"$ne": None},
    }

    style = current_user.get("style")
    city = current_user.get("city")

    # Du plus ciblé au plus large. L'ordre compte : le premier filtre qui donne
    # assez de monde évite d'élargir inutilement.
    passes: list[dict[str, Any]] = []
    if style and city:
        passes.append({**presentable, "style": style, "city": city})
    if style:
        passes.append({**presentable, "style": style})
    passes.append(presentable)

    suggestions: list[dict[str, Any]] = []
    seen: set[Any] = set()
    for query in passes:
        if len(suggestions) >= 10:
            break
        cursor = database.users.find(query).sort("average_rating", -1).limit(10)
        async for document in cursor:
            if document["_id"] in seen:
                continue
            seen.add(document["_id"])
            suggestions.append(document)
            if len(suggestions) >= 10:
                break

    items = [serialize_partner(document) for document in suggestions]
    return {"items": items, "total": len(items), "page": 1, "limit": len(items)}
