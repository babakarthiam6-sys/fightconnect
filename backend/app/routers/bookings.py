"""Demandes de sparring : création, réponse du partenaire, annulation, avis."""

from datetime import datetime, timezone
from typing import Annotated, Any

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from app.config import get_settings
from app.dependencies import CurrentUser, Database
from app.repositories import expand_booking, expand_bookings
from app.schemas import BookingCreate, BookingList, BookingOut, ReviewList
from app.serializers import serialize_review, to_object_id
from app.services.payments import refund_payment

router = APIRouter(prefix="/bookings", tags=["réservations"])

NOT_FOUND = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND, detail="Demande introuvable."
)


def parse_scheduled_at(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Date invalide : format ISO 8601 attendu.",
        ) from error

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    if parsed <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La séance doit être programmée dans le futur.",
        )
    return parsed


def quote(price_per_round: float, rounds: int) -> dict[str, float]:
    """Décompte d'une demande.

    La commission est prélevée **sur la part du partenaire**, elle ne s'ajoute
    pas au total : celui qui réserve paie exactement le tarif annoncé multiplié
    par le nombre de rounds. Un supplément découvert au moment de payer est la
    première cause d'abandon d'une réservation.
    """
    settings = get_settings()
    total = round(price_per_round * rounds, 2)
    commission = round(total * settings.commission_rate, 2)
    return {
        "price_per_round": round(price_per_round, 2),
        "total": total,
        "commission": commission,
        "payout": round(total - commission, 2),
    }


async def fetch_booking(database: AsyncIOMotorDatabase, booking_id: str) -> dict[str, Any]:
    object_id = to_object_id(booking_id)
    if object_id is None:
        raise NOT_FOUND
    document = await database.bookings.find_one({"_id": object_id})
    if document is None:
        raise NOT_FOUND
    return document


def _has_ended(document: dict[str, Any]) -> bool:
    scheduled = document.get("scheduled_at")
    if not isinstance(scheduled, datetime):
        return False
    if scheduled.tzinfo is None:
        scheduled = scheduled.replace(tzinfo=timezone.utc)
    return scheduled <= datetime.now(timezone.utc)


@router.post("", response_model=BookingOut, status_code=status.HTTP_201_CREATED)
async def create_booking(
    payload: BookingCreate,
    database: Database,
    current_user: CurrentUser,
) -> dict[str, Any]:
    partner_id = to_object_id(payload.partner_id)
    partner = await database.users.find_one({"_id": partner_id}) if partner_id else None
    if partner is None:
        raise HTTPException(status_code=404, detail="Partenaire introuvable.")

    if partner["_id"] == current_user["_id"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="On ne peut pas se réserver soi-même.",
        )
    if not partner.get("available"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ce partenaire n’est pas disponible en ce moment.",
        )
    if partner.get("price_per_round") is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ce partenaire n’a pas encore fixé son tarif.",
        )

    scheduled_at = parse_scheduled_at(payload.scheduled_at)

    identity = {
        "requester_id": current_user["_id"],
        "partner_id": partner["_id"],
        "scheduled_at": scheduled_at,
    }

    # Une demande déjà acceptée pour ce créneau ne doit pas être redoublée. Le
    # cas « en attente » est traité plus bas par l'index unique : le vérifier ici
    # aussi ne coûte rien et évite un aller-retour dans le cas courant.
    existing = await database.bookings.find_one(
        {**identity, "status": {"$in": ["pending", "accepted"]}}
    )
    if existing is not None:
        return await expand_booking(database, existing)

    document = {
        **identity,
        "rounds": payload.rounds,
        **quote(float(partner["price_per_round"]), payload.rounds),
        "currency": partner.get("currency", "EUR"),
        "status": "pending",
        "paid": False,
        "reviewed": False,
        "created_at": datetime.now(timezone.utc),
    }
    try:
        result = await database.bookings.insert_one(document)
    except DuplicateKeyError:
        # Deux envois simultanés : l'index a tranché, le perdant relit le
        # gagnant plutôt que de renvoyer une erreur à quelqu'un dont la demande
        # est bel et bien partie.
        winner = await database.bookings.find_one({**identity, "status": "pending"})
        if winner is None:
            raise
        return await expand_booking(database, winner)

    document["_id"] = result.inserted_id
    return await expand_booking(database, document)


@router.get("", response_model=BookingList)
async def list_bookings(
    database: Database,
    current_user: CurrentUser,
    direction: Annotated[str, Query(pattern="^(received|sent)$")] = "sent",
) -> dict[str, Any]:
    field = "partner_id" if direction == "received" else "requester_id"
    documents = [
        document
        async for document in database.bookings.find({field: current_user["_id"]}).sort(
            "scheduled_at", -1
        )
    ]
    items = await expand_bookings(database, documents)
    return {"items": items, "total": len(items)}


async def _transition(
    database: AsyncIOMotorDatabase,
    booking: dict[str, Any],
    new_status: str,
) -> dict[str, Any]:
    await database.bookings.update_one(
        {"_id": booking["_id"]}, {"$set": {"status": new_status}}
    )
    refreshed = await database.bookings.find_one({"_id": booking["_id"]})
    assert refreshed is not None
    return await expand_booking(database, refreshed)


@router.post("/{booking_id}/accept", response_model=BookingOut)
async def accept(booking_id: str, database: Database, current_user: CurrentUser) -> dict[str, Any]:
    booking = await fetch_booking(database, booking_id)
    if booking["partner_id"] != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Cette demande ne vous est pas adressée.")
    if booking.get("status") != "pending":
        raise HTTPException(status_code=409, detail="Cette demande a déjà été traitée.")
    return await _transition(database, booking, "accepted")


@router.post("/{booking_id}/decline", response_model=BookingOut)
async def decline(booking_id: str, database: Database, current_user: CurrentUser) -> dict[str, Any]:
    booking = await fetch_booking(database, booking_id)
    if booking["partner_id"] != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Cette demande ne vous est pas adressée.")
    if booking.get("status") != "pending":
        raise HTTPException(status_code=409, detail="Cette demande a déjà été traitée.")
    return await _transition(database, booking, "declined")


@router.post("/{booking_id}/cancel", response_model=BookingOut)
async def cancel(booking_id: str, database: Database, current_user: CurrentUser) -> dict[str, Any]:
    booking = await fetch_booking(database, booking_id)
    user_id: ObjectId = current_user["_id"]

    if user_id not in {booking.get("requester_id"), booking.get("partner_id")}:
        raise HTTPException(status_code=403, detail="Cette demande ne vous concerne pas.")
    if booking.get("status") not in {"pending", "accepted"}:
        raise HTTPException(status_code=409, detail="Cette demande ne peut plus être annulée.")

    # Le remboursement est demandé **avant** de changer le statut : si Stripe
    # échoue, la demande reste debout plutôt que d'être annulée sans que
    # l'argent soit rendu.
    payment = await database.payments.find_one(
        {"booking_id": booking["_id"], "status": "succeeded"}
    )
    if payment is not None and not _has_ended(booking) and payment.get("payment_intent_id"):
        await refund_payment(payment["payment_intent_id"])
        await database.payments.update_one(
            {"_id": payment["_id"]}, {"$set": {"status": "refunded"}}
        )
        await database.bookings.update_one({"_id": booking["_id"]}, {"$set": {"paid": False}})

    return await _transition(database, booking, "cancelled")


@router.post("/{booking_id}/complete", response_model=BookingOut)
async def complete(booking_id: str, database: Database, current_user: CurrentUser) -> dict[str, Any]:
    booking = await fetch_booking(database, booking_id)
    if current_user["_id"] not in {booking.get("requester_id"), booking.get("partner_id")}:
        raise HTTPException(status_code=403, detail="Cette demande ne vous concerne pas.")
    if booking.get("status") != "accepted":
        raise HTTPException(status_code=409, detail="Seule une demande acceptée peut être clôturée.")
    if not _has_ended(booking):
        raise HTTPException(status_code=409, detail="La séance n’a pas encore eu lieu.")
    return await _transition(database, booking, "completed")


@router.get("/{booking_id}/reviews", response_model=ReviewList)
async def list_reviews(booking_id: str, database: Database) -> dict[str, Any]:
    booking = await fetch_booking(database, booking_id)

    reviews = [
        review
        async for review in database.reviews.find({"booking_id": booking["_id"]}).sort(
            "created_at", -1
        )
    ]
    author_ids = [review["author_id"] for review in reviews if review.get("author_id")]
    authors = {
        str(user["_id"]): user
        async for user in database.users.find({"_id": {"$in": author_ids}})
    }

    items = [
        serialize_review(review, authors.get(str(review.get("author_id")))) for review in reviews
    ]
    return {"items": items, "total": len(items)}
