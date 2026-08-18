"""Intégration Stripe.

La clé secrète ne quitte jamais le serveur : le client mobile ne reçoit qu'un
`client_secret` lié à un PaymentIntent, ce qui lui permet d'ouvrir la Payment
Sheet sans jamais manipuler de données de carte.
"""

from typing import Any

import stripe
from fastapi import HTTPException, status

from app.config import get_settings


def _require_stripe() -> None:
    settings = get_settings()
    if not settings.is_stripe_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Le paiement est indisponible : STRIPE_SECRET_KEY n’est pas configurée.",
        )
    stripe.api_key = settings.stripe_secret_key


def to_minor_units(amount: float) -> int:
    """Convertit des euros en centimes, seule unité acceptée par Stripe."""
    return int(round(amount * 100))


async def create_payment_intent(
    amount: float,
    metadata: dict[str, str],
) -> dict[str, Any]:
    _require_stripe()
    settings = get_settings()

    try:
        intent = stripe.PaymentIntent.create(
            amount=to_minor_units(amount),
            currency=settings.currency,
            metadata=metadata,
            automatic_payment_methods={"enabled": True},
        )
    except stripe.StripeError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Stripe a refusé la création du paiement : {error.user_message or error}",
        ) from error

    return {
        "id": intent.id,
        "client_secret": intent.client_secret,
        "amount": intent.amount / 100,
        "currency": (intent.currency or settings.currency).upper(),
    }


async def retrieve_payment_status(payment_intent_id: str) -> str | None:
    """Statut réel d'un PaymentIntent, ou None si Stripe est injoignable."""
    settings = get_settings()
    if not settings.is_stripe_configured:
        return None

    stripe.api_key = settings.stripe_secret_key
    try:
        intent = stripe.PaymentIntent.retrieve(payment_intent_id)
    except stripe.StripeError:
        return None

    return intent.status


def map_stripe_status(stripe_status: str | None) -> str:
    """Traduit un statut Stripe vers le vocabulaire de l'application."""
    mapping = {
        "succeeded": "succeeded",
        "processing": "processing",
        "requires_payment_method": "pending",
        "requires_confirmation": "pending",
        "requires_action": "pending",
        "requires_capture": "processing",
        "canceled": "cancelled",
    }
    return mapping.get(stripe_status or "", "pending")
