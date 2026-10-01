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
from app.services.payments import (
    cancel_payment_intent,
    refund_payment,
    retrieve_payment_status,
)

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


def has_ended(document: dict[str, Any]) -> bool:
    scheduled = document.get("scheduled_at")
    if not isinstance(scheduled, datetime):
        return False
    if scheduled.tzinfo is None:
        scheduled = scheduled.replace(tzinfo=timezone.utc)
    return scheduled <= datetime.now(timezone.utc)


# Un paiement refusé (`failed`) reste payable : Stripe ramène l'intention à
# `requires_payment_method` et la Payment Sheet peut réessayer avec une autre
# carte. Il compte donc parmi les paiements à fermer.
OPEN_PAYMENT_STATUSES = ["pending", "processing", "failed"]

PAYMENT_IN_FLIGHT = HTTPException(
    status_code=status.HTTP_409_CONFLICT,
    detail=(
        "Un paiement est en cours de traitement par la banque. Réessayez une fois "
        "qu’il sera terminé."
    ),
)
STRIPE_UNREACHABLE = HTTPException(
    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
    detail="Un paiement est encore ouvert et Stripe ne répond pas. Réessayez dans quelques minutes.",
)


async def _open_payments(
    database: AsyncIOMotorDatabase, booking: dict[str, Any]
) -> list[dict[str, Any]]:
    return [
        payment
        async for payment in database.payments.find(
            {"booking_id": booking["_id"], "status": {"$in": OPEN_PAYMENT_STATUSES}}
        )
        if payment.get("payment_intent_id")
    ]


async def _live_status(payment_intent_id: str) -> str:
    """Statut Stripe réel d'une intention, ou une erreur si on ne peut pas trancher."""
    stripe_status = await retrieve_payment_status(payment_intent_id)
    if stripe_status is None:
        raise STRIPE_UNREACHABLE
    if stripe_status in {"processing", "requires_capture"}:
        raise PAYMENT_IN_FLIGHT
    return stripe_status


async def check_open_payments(database: AsyncIOMotorDatabase, booking: dict[str, Any]) -> None:
    """Vérifie, sans rien modifier, que les paiements ouverts peuvent être fermés.

    Permet à un traitement portant sur plusieurs demandes de s'arrêter avant le
    premier remboursement plutôt qu'au milieu.
    """
    for payment in await _open_payments(database, booking):
        await _live_status(payment["payment_intent_id"])


async def refund_if_paid(database: AsyncIOMotorDatabase, booking: dict[str, Any]) -> bool:
    """Rembourse tous les paiements aboutis d'une séance à venir.

    À appeler **avant** de passer la demande en annulée : si Stripe échoue,
    l'exception remonte et la demande reste debout, avec l'argent encaissé.

    Renvoie `False` quand de l'argent encaissé est conservé parce que la séance
    a commencé : c'est à l'appelant de décider s'il annule quand même.
    """
    payments = [
        payment
        async for payment in database.payments.find(
            {"booking_id": booking["_id"], "status": "succeeded"}
        )
        if payment.get("payment_intent_id")
    ]
    if not payments:
        return True
    if has_ended(booking):
        return False

    # Tous, pas seulement le premier : une intention recréée après une panne
    # passagère peut avoir été payée elle aussi.
    for payment in payments:
        await refund_payment(payment["payment_intent_id"])
        await database.payments.update_one(
            {"_id": payment["_id"]}, {"$set": {"status": "refunded"}}
        )
    await database.bookings.update_one({"_id": booking["_id"]}, {"$set": {"paid": False}})
    return True


async def release_payments(database: AsyncIOMotorDatabase, booking: dict[str, Any]) -> bool:
    """Rend l'argent d'une demande qu'on s'apprête à annuler.

    Chaque intention encore ouverte est fermée chez Stripe — sinon la personne
    qui a réservé pourrait encore payer une séance qui n'existe plus — puis les
    paiements aboutis sont remboursés. Partagé par l'annulation et par la
    suppression de compte. Même valeur de retour que `refund_if_paid`.
    """
    for payment in await _open_payments(database, booking):
        intent_id = payment["payment_intent_id"]
        stripe_status = await _live_status(intent_id)
        if stripe_status == "succeeded":
            # Le webhook n'est pas encore passé : la base s'aligne sur Stripe,
            # et le remboursement ci-dessous s'en charge.
            await database.payments.update_one(
                {"_id": payment["_id"]}, {"$set": {"status": "succeeded"}}
            )
            await database.bookings.update_one({"_id": booking["_id"]}, {"$set": {"paid": True}})
            continue
        if stripe_status != "canceled":
            await cancel_payment_intent(intent_id)
        await database.payments.update_one(
            {"_id": payment["_id"]}, {"$set": {"status": "cancelled"}}
        )

    return await refund_if_paid(database, booking)


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
    # l'argent soit rendu. Une séance déjà commencée s'annule sans
    # remboursement, comme auparavant.
    await release_payments(database, booking)
    return await _transition(database, booking, "cancelled")


@router.post("/{booking_id}/complete", response_model=BookingOut)
async def complete(booking_id: str, database: Database, current_user: CurrentUser) -> dict[str, Any]:
    booking = await fetch_booking(database, booking_id)
    if current_user["_id"] not in {booking.get("requester_id"), booking.get("partner_id")}:
        raise HTTPException(status_code=403, detail="Cette demande ne vous concerne pas.")
    if booking.get("status") != "accepted":
        raise HTTPException(status_code=409, detail="Seule une demande acceptée peut être clôturée.")
    if not has_ended(booking):
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
