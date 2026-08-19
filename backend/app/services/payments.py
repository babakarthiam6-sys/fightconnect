"""Intégration Stripe, y compris les versements aux organisateurs (Connect).

La clé secrète ne quitte jamais le serveur : le client mobile ne reçoit qu'un
`client_secret` lié à un PaymentIntent, ce qui lui permet d'ouvrir la Payment
Sheet sans jamais manipuler de données de carte.

Les organisateurs sont payés par « charge à destination » : le paiement est
encaissé par la plateforme, qui en transfère aussitôt la part de l'organisateur
sur son compte Connect et retient sa commission. Stripe se charge ensuite du
virement bancaire selon le calendrier du compte.

Le SDK Stripe est synchrone. Appelé tel quel dans une coroutine, il bloquerait la
boucle d'évènements pendant tout l'aller-retour réseau : chaque appel passe donc
par un pool de threads.
"""

from typing import Any

import stripe
from fastapi import HTTPException, status
from fastapi.concurrency import run_in_threadpool

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
    destination_account: str | None = None,
    application_fee: float | None = None,
) -> dict[str, Any]:
    """Crée l'intention de paiement.

    Avec `destination_account`, la part de l'organisateur part directement sur
    son compte Connect et `application_fee` reste à la plateforme. Sans lui, la
    totalité reste sur le compte de la plateforme — c'est le cas tant que
    l'organisateur n'a pas terminé son inscription Stripe.
    """
    _require_stripe()
    settings = get_settings()

    options: dict[str, Any] = {
        "amount": to_minor_units(amount),
        "currency": settings.currency,
        "metadata": metadata,
        "automatic_payment_methods": {"enabled": True},
    }

    if destination_account:
        options["transfer_data"] = {"destination": destination_account}
        if application_fee is not None:
            options["application_fee_amount"] = to_minor_units(application_fee)

    try:
        intent = await run_in_threadpool(lambda: stripe.PaymentIntent.create(**options))
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


async def retrieve_payment_intent(payment_intent_id: str) -> dict[str, Any] | None:
    """Recharge une intention existante, ou None si elle est introuvable."""
    settings = get_settings()
    if not settings.is_stripe_configured:
        return None

    stripe.api_key = settings.stripe_secret_key
    try:
        intent = await run_in_threadpool(stripe.PaymentIntent.retrieve, payment_intent_id)
    except stripe.StripeError:
        return None

    return {
        "id": intent.id,
        "client_secret": intent.client_secret,
        "amount": intent.amount / 100,
        "currency": (intent.currency or settings.currency).upper(),
        "status": intent.status,
    }


async def retrieve_payment_status(payment_intent_id: str) -> str | None:
    """Statut réel d'un PaymentIntent, ou None si Stripe est injoignable."""
    settings = get_settings()
    if not settings.is_stripe_configured:
        return None

    stripe.api_key = settings.stripe_secret_key
    try:
        intent = await run_in_threadpool(stripe.PaymentIntent.retrieve, payment_intent_id)
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


# --------------------------------------------------------------------------
# Comptes des organisateurs (Stripe Connect)
# --------------------------------------------------------------------------


async def create_connected_account(email: str, full_name: str) -> str:
    """Crée le compte Connect d'un organisateur et renvoie son identifiant.

    Type « express » : Stripe prend en charge la collecte des pièces d'identité
    et des coordonnées bancaires, ainsi que la conformité qui va avec. La
    plateforme n'a donc jamais à manipuler ces données.
    """
    _require_stripe()

    try:
        account = await run_in_threadpool(
            lambda: stripe.Account.create(
                type="express",
                email=email,
                business_type="individual",
                capabilities={
                    "card_payments": {"requested": True},
                    "transfers": {"requested": True},
                },
                metadata={"platform": "FightConnect", "full_name": full_name},
            )
        )
    except stripe.StripeError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Stripe a refusé la création du compte : {error.user_message or error}",
        ) from error

    return str(account.id)


async def create_onboarding_link(account_id: str, return_url: str) -> str:
    """Lien d'inscription Stripe, à ouvrir dans un navigateur.

    Le lien expire vite et ne sert qu'une fois : il est régénéré à chaque
    demande plutôt que stocké.
    """
    _require_stripe()

    try:
        link = await run_in_threadpool(
            lambda: stripe.AccountLink.create(
                account=account_id,
                refresh_url=return_url,
                return_url=return_url,
                type="account_onboarding",
            )
        )
    except stripe.StripeError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Stripe a refusé la création du lien : {error.user_message or error}",
        ) from error

    return str(link.url)


async def retrieve_account_state(account_id: str) -> dict[str, Any] | None:
    """État d'un compte Connect, ou None si Stripe est injoignable.

    `payouts_enabled` est le seul drapeau qui compte vraiment : il indique que
    Stripe accepte de verser l'argent sur le compte bancaire de la personne.
    """
    settings = get_settings()
    if not settings.is_stripe_configured:
        return None

    stripe.api_key = settings.stripe_secret_key
    try:
        account = await run_in_threadpool(stripe.Account.retrieve, account_id)
    except stripe.StripeError:
        return None

    return {
        "id": str(account.id),
        "details_submitted": bool(account.details_submitted),
        "payouts_enabled": bool(account.payouts_enabled),
        "charges_enabled": bool(account.charges_enabled),
    }


async def refund_payment(payment_intent_id: str) -> dict[str, Any]:
    """Rembourse intégralement un paiement.

    `reverse_transfer` reprend la part déjà transférée à l'organisateur et
    `refund_application_fee` rend la commission : sans ces deux options, la
    plateforme rembourserait le client de sa propre poche.
    """
    _require_stripe()

    try:
        refund = await run_in_threadpool(
            lambda: stripe.Refund.create(
                payment_intent=payment_intent_id,
                reverse_transfer=True,
                refund_application_fee=True,
            )
        )
    except stripe.StripeError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Stripe a refusé le remboursement : {error.user_message or error}",
        ) from error

    return {"id": str(refund.id), "status": str(refund.status)}
