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

from app.i18n import t
from app.config import get_settings


def _require_stripe() -> None:
    settings = get_settings()
    if not settings.is_stripe_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=t("paiement.stripe_absent"),
        )
    stripe.api_key = settings.stripe_secret_key


# Devises sans subdivision : le yen n'a pas de centime, ni le franc CFA. Stripe
# attend alors le montant tel quel, et non multiplié par cent.
_SANS_DECIMALE = frozenset(
    {"BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF",
     "UGX", "VND", "VUV", "XAF", "XOF", "XPF"}
)

# Devises à trois décimales : le millime tunisien, le dinar koweïtien.
_TROIS_DECIMALES = frozenset({"BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"})


def to_minor_units(amount: float, currency: str = "EUR") -> int:
    """Convertit un montant dans la plus petite unité de sa devise.

    Multiplier par cent sans regarder la devise ferait facturer mille yens
    cent mille : le yen n'a pas de subdivision, le franc CFA non plus. Stripe
    exige la plus petite unité réelle, qui dépend de la devise.
    """
    code = (currency or "EUR").upper()
    if code in _SANS_DECIMALE:
        return int(round(amount))
    if code in _TROIS_DECIMALES:
        # Stripe impose un multiple de dix pour ces devises : le dernier chiffre
        # doit rester à zéro.
        return int(round(amount * 1000 / 10)) * 10
    return int(round(amount * 100))


async def create_payment_intent(
    amount: float,
    metadata: dict[str, str],
    destination_account: str | None = None,
    application_fee: float | None = None,
    currency: str | None = None,
) -> dict[str, Any]:
    """Crée l'intention de paiement.

    Avec `destination_account`, la part de l'organisateur part directement sur
    son compte Connect et `application_fee` reste à la plateforme. Sans lui, la
    totalité reste sur le compte de la plateforme — c'est le cas tant que
    l'organisateur n'a pas terminé son inscription Stripe.
    """
    _require_stripe()
    settings = get_settings()

    # La devise vient de la demande, pas d'un réglage global : c'est le tarif
    # que le partenaire a annoncé, dans la monnaie où il l'a annoncé.
    devise = (currency or settings.currency).lower()

    options: dict[str, Any] = {
        "amount": to_minor_units(amount, devise),
        "currency": devise,
        "metadata": metadata,
        "automatic_payment_methods": {"enabled": True},
    }

    if destination_account:
        options["transfer_data"] = {"destination": destination_account}
        if application_fee is not None:
            options["application_fee_amount"] = to_minor_units(application_fee, devise)

    try:
        intent = await run_in_threadpool(lambda: stripe.PaymentIntent.create(**options))
    except stripe.StripeError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=t("paiement.stripe_refuse_paiement", raison=error.user_message or error),
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

# Rempli au premier appel, jamais vidé : la couverture de Stripe ne bouge pas
# à l'échelle d'un déploiement.
_pays_verses: list[str] | None = None


async def list_payout_countries() -> list[str]:
    """Pays où Stripe sait ouvrir un compte et verser de l'argent.

    Demandé à Stripe plutôt que recopié : sa couverture s'étend régulièrement, et
    une liste figée dans le code refuserait en silence un pays devenu possible.
    Le résultat est gardé en mémoire — il ne change pas d'une minute à l'autre.
    """
    global _pays_verses
    if _pays_verses is not None:
        return _pays_verses
    if not get_settings().is_stripe_configured:
        return []

    try:
        page = await run_in_threadpool(lambda: stripe.CountrySpec.list(limit=100))
    except stripe.StripeError:
        # Ne pas connaître la liste ne doit pas casser l'écran : on répondra
        # « je ne sais pas » plutôt que « impossible ».
        return []

    _pays_verses = sorted(str(spec.id).upper() for spec in page.auto_paging_iter())
    return _pays_verses


async def create_connected_account(
    email: str, full_name: str, country: str | None = None
) -> str:
    """Crée le compte Connect d'un organisateur et renvoie son identifiant.

    Type « express » : Stripe prend en charge la collecte des pièces d'identité
    et des coordonnées bancaires, ainsi que la conformité qui va avec. La
    plateforme n'a donc jamais à manipuler ces données.

    Le pays vient du profil. Sans lui, Stripe retiendrait celui de la
    plateforme, et quelqu'un à Montréal se verrait demander un RIB français.
    """
    _require_stripe()

    options: dict[str, Any] = {
        "type": "express",
        "email": email,
        "business_type": "individual",
        "capabilities": {
            "card_payments": {"requested": True},
            "transfers": {"requested": True},
        },
        "metadata": {"platform": "FightConnect", "full_name": full_name},
    }
    if country:
        options["country"] = country.upper()

    try:
        account = await run_in_threadpool(lambda: stripe.Account.create(**options))
    except stripe.StripeError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=t("paiement.stripe_refuse_compte", raison=error.user_message or error),
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
            detail=t("paiement.stripe_refuse_lien", raison=error.user_message or error),
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
            detail=t("paiement.stripe_refuse_remboursement", raison=error.user_message or error),
        ) from error

    return {"id": str(refund.id), "status": str(refund.status)}
