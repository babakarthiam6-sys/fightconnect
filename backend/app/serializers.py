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


def serialize_user_summary(document: dict[str, Any] | None) -> dict[str, Any] | None:
    if not document:
        return None
    return {
        "id": str(document["_id"]),
        "first_name": document.get("first_name", ""),
        "last_name": document.get("last_name", ""),
        "avatar_url": document.get("avatar_url"),
        "average_rating": document.get("average_rating"),
    }


def serialize_user(document: dict[str, Any]) -> dict[str, Any]:
    summary = serialize_user_summary(document) or {}
    return {
        **summary,
        "email": document.get("email", ""),
        "discharge_accepted": bool(document.get("discharge_accepted", False)),
        "ratings_count": int(document.get("ratings_count", 0)),
        "created_at": iso(document.get("created_at")),
    }


def serialize_sparring(
    document: dict[str, Any],
    creator: dict[str, Any] | None,
    participants: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "id": str(document["_id"]),
        "title": document.get("title", ""),
        "description": document.get("description", ""),
        "location": document.get("location", ""),
        "scheduled_at": iso(document.get("scheduled_at")) or "",
        "duration_minutes": int(document.get("duration_minutes", 60)),
        "level": document.get("level", "beginner"),
        "style": document.get("style", "boxing"),
        "price": float(document.get("price", 0)),
        "currency": document.get("currency", "EUR"),
        "max_participants": int(document.get("max_participants", 2)),
        "participants": [
            summary
            for summary in (serialize_user_summary(person) for person in participants)
            if summary is not None
        ],
        "creator": serialize_user_summary(creator),
        "status": document.get("status", "open"),
        "created_at": iso(document.get("created_at")),
    }


def serialize_payment(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(document["_id"]),
        "sparring_id": str(document["sparring_id"]) if document.get("sparring_id") else None,
        "sparring_title": document.get("sparring_title"),
        "amount": float(document.get("amount", 0)),
        "currency": document.get("currency", "EUR"),
        "status": document.get("status", "pending"),
        "created_at": iso(document.get("created_at")),
        "receipt_url": document.get("receipt_url"),
    }


def serialize_review(document: dict[str, Any], author: dict[str, Any] | None) -> dict[str, Any]:
    return {
        "id": str(document["_id"]),
        "sparring_id": str(document.get("sparring_id", "")),
        "author": serialize_user_summary(author),
        "rating": int(document.get("rating", 0)),
        "comment": document.get("comment", ""),
        "created_at": iso(document.get("created_at")),
        "flagged": bool(document.get("flagged", False)),
        "flag_reason": document.get("flag_reason"),
        "moderation_score": document.get("moderation_score"),
    }
