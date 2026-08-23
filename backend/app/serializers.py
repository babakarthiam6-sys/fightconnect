"""Conversion des documents Mongo vers les schémas de sortie."""

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId


def to_object_id(value: str) -> ObjectId | None:
    """Convertit un identifiant textuel, ou None s'il est malformé."""
    try:
        return ObjectId(value)
    except Exception:
        return None


def iso(value: Any) -> str | None:
    if isinstance(value, datetime):
        # Mongo renvoie des datetimes naïfs en UTC : on les rend explicites pour
        # que le client n'ait pas à deviner le fuseau.
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    if isinstance(value, str):
        return value
    return None


def _price(document: dict[str, Any]) -> float | None:
    value = document.get("price_per_round")
    return float(value) if value is not None else None


def serialize_user_summary(document: dict[str, Any] | None) -> dict[str, Any] | None:
    if not document:
        return None
    return {
        "id": str(document["_id"]),
        "first_name": document.get("first_name", ""),
        "last_name": document.get("last_name", ""),
        "avatar_url": document.get("avatar_url"),
        "average_rating": document.get("average_rating"),
        "city": document.get("city"),
        "price_per_round": _price(document),
    }


def _sport_profile(document: dict[str, Any]) -> dict[str, Any]:
    """Champs sportifs communs au profil privé et à la fiche publique."""
    return {
        "country": document.get("country"),
        "bio": document.get("bio"),
        "style": document.get("style"),
        "level": document.get("level"),
        "weight_class": document.get("weight_class"),
        "height_cm": document.get("height_cm"),
        "fights_count": int(document.get("fights_count", 0)),
        "experience_years": int(document.get("experience_years", 0)),
        "available": bool(document.get("available", False)),
        "currency": document.get("currency", "EUR"),
    }


def serialize_user(document: dict[str, Any]) -> dict[str, Any]:
    summary = serialize_user_summary(document) or {}
    return {
        **summary,
        **_sport_profile(document),
        "email": document.get("email", ""),
        "discharge_accepted": bool(document.get("discharge_accepted", False)),
        "ratings_count": int(document.get("ratings_count", 0)),
        "created_at": iso(document.get("created_at")),
        "payouts_enabled": bool(document.get("stripe_payouts_enabled", False)),
        "expo_push_token": document.get("expo_push_token"),
    }


def serialize_partner(document: dict[str, Any]) -> dict[str, Any]:
    """Fiche publique.

    Volontairement construite champ par champ plutôt qu'en retirant l'email d'un
    profil complet : une soustraction laisse passer tout champ ajouté plus tard.
    """
    return {
        "id": str(document["_id"]),
        "first_name": document.get("first_name", ""),
        "last_name": document.get("last_name", ""),
        "avatar_url": document.get("avatar_url"),
        "average_rating": document.get("average_rating"),
        "ratings_count": int(document.get("ratings_count", 0)),
        "city": document.get("city"),
        "price_per_round": _price(document),
        # Seul champ de compte qui traverse : il ne dit rien de la personne, il
        # dit si une séance avec elle sera payable. L'écran a besoin de le
        # savoir avant que la demande ne parte.
        "payouts_enabled": bool(document.get("stripe_payouts_enabled", False)),
        **_sport_profile(document),
    }


def serialize_booking(
    document: dict[str, Any],
    requester: dict[str, Any] | None,
    partner: dict[str, Any] | None,
) -> dict[str, Any]:
    return {
        "id": str(document["_id"]),
        "requester": serialize_user_summary(requester),
        "partner": serialize_user_summary(partner),
        "scheduled_at": iso(document.get("scheduled_at")) or "",
        "rounds": int(document.get("rounds", 1)),
        "price_per_round": float(document.get("price_per_round", 0)),
        "total": float(document.get("total", 0)),
        "commission": float(document.get("commission", 0)),
        "payout": float(document.get("payout", 0)),
        "currency": document.get("currency", "EUR"),
        "status": document.get("status", "pending"),
        "paid": bool(document.get("paid", False)),
        "reviewed": bool(document.get("reviewed", False)),
        "created_at": iso(document.get("created_at")),
    }


def serialize_payment(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(document["_id"]),
        "booking_id": str(document["booking_id"]) if document.get("booking_id") else None,
        "partner_name": document.get("partner_name"),
        "amount": float(document.get("amount", 0)),
        "currency": document.get("currency", "EUR"),
        "status": document.get("status", "pending"),
        "created_at": iso(document.get("created_at")),
        "receipt_url": document.get("receipt_url"),
    }


def serialize_review(document: dict[str, Any], author: dict[str, Any] | None) -> dict[str, Any]:
    return {
        "id": str(document["_id"]),
        "booking_id": str(document.get("booking_id", "")),
        "author": serialize_user_summary(author),
        "rating": int(document.get("rating", 0)),
        "comment": document.get("comment", ""),
        "created_at": iso(document.get("created_at")),
        "flagged": bool(document.get("flagged", False)),
        "flag_reason": document.get("flag_reason"),
        "moderation_score": document.get("moderation_score"),
    }


def serialize_message(
    document: dict[str, Any],
    author: dict[str, Any] | None,
) -> dict[str, Any]:
    return {
        "id": str(document["_id"]),
        "conversation_id": document.get("conversation_id", ""),
        "sender_id": str(document.get("sender_id", "")),
        "recipient_id": str(document.get("recipient_id", "")),
        "author": serialize_user_summary(author),
        "content": document.get("content", ""),
        "read": bool(document.get("read", False)),
        "created_at": iso(document.get("created_at")),
    }


def serialize_conversation(
    conversation_id: str,
    other: dict[str, Any] | None,
    last_message: dict[str, Any],
    unread: int,
) -> dict[str, Any]:
    return {
        "id": conversation_id,
        "other": serialize_user_summary(other),
        "last_message": last_message.get("content", ""),
        "last_message_at": iso(last_message.get("created_at")),
        "unread": unread,
    }
