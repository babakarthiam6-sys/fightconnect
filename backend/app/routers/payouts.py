"""Versements aux organisateurs (Stripe Connect).

Un organisateur qui publie une séance payante doit pouvoir être payé. Stripe
exige pour cela un compte vérifié : pièce d'identité, coordonnées bancaires.
Tout cela est collecté par Stripe lui-même, sur ses propres pages — l'API ne
voit jamais ces données et se contente de fabriquer le lien.
"""

from typing import Any

from fastapi import APIRouter, Request

from app.config import get_settings
from app.dependencies import CurrentUser, Database
from app.schemas import OnboardingLinkOut, PayoutStatusOut
from app.services.payments import (
    create_connected_account,
    list_payout_countries,
    create_onboarding_link,
    retrieve_account_state,
)

router = APIRouter(prefix="/payouts", tags=["payouts"])


async def refresh_account_state(database: Any, user: dict[str, Any]) -> dict[str, Any]:
    """Resynchronise l'état du compte depuis Stripe et le persiste.

    L'état fait autorité chez Stripe : le nôtre n'est qu'un reflet, mis à jour
    ici et par le webhook `account.updated`.
    """
    account_id = user.get("stripe_account_id")
    if not account_id:
        return {"connected": False, "details_submitted": False, "payouts_enabled": False}

    state = await retrieve_account_state(account_id)
    if state is None:
        # Stripe injoignable : on renvoie le dernier état connu plutôt qu'une erreur.
        return {
            "connected": True,
            "details_submitted": bool(user.get("stripe_details_submitted", False)),
            "payouts_enabled": bool(user.get("stripe_payouts_enabled", False)),
        }

    await database.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "stripe_details_submitted": state["details_submitted"],
                "stripe_payouts_enabled": state["payouts_enabled"],
            }
        },
    )

    return {
        "connected": True,
        "details_submitted": state["details_submitted"],
        "payouts_enabled": state["payouts_enabled"],
    }


@router.get("/status", response_model=PayoutStatusOut)
async def status(database: Database, current_user: CurrentUser) -> dict[str, Any]:
    settings = get_settings()
    state = await refresh_account_state(database, current_user)
    return {**state, "stripe_configured": settings.is_stripe_configured}


@router.get("/countries")
async def payout_countries() -> dict[str, Any]:
    """Pays où un partenaire peut effectivement être payé.

    L'écran s'en sert pour prévenir avant l'inscription plutôt que de laisser
    quelqu'un remplir un formulaire Stripe qui le refusera. Une liste vide
    signifie « on ne sait pas encore » — Stripe n'est pas configuré ou n'a pas
    répondu — et l'écran doit alors se taire, pas accuser.
    """
    codes = await list_payout_countries()
    return {"items": codes, "known": bool(codes)}


@router.post("/onboarding", response_model=OnboardingLinkOut)
async def onboarding(
    request: Request,
    database: Database,
    current_user: CurrentUser,
) -> dict[str, str]:
    """Renvoie le lien d'inscription Stripe, en créant le compte au besoin.

    Le lien expire en quelques minutes et ne sert qu'une fois : il est fabriqué
    à chaque appel plutôt que conservé.
    """
    account_id = current_user.get("stripe_account_id")

    if not account_id:
        full_name = f"{current_user.get('first_name', '')} {current_user.get('last_name', '')}".strip()
        account_id = await create_connected_account(
            current_user.get("email", ""), full_name, current_user.get("country")
        )
        await database.users.update_one(
            {"_id": current_user["_id"]},
            {
                "$set": {
                    "stripe_account_id": account_id,
                    "stripe_details_submitted": False,
                    "stripe_payouts_enabled": False,
                }
            },
        )

    settings = get_settings()
    # L'utilisateur revient sur l'application après l'inscription Stripe.
    base = settings.public_base_url or str(request.base_url).rstrip("/")
    url = await create_onboarding_link(account_id, f"{base}/profile")

    return {"url": url}
