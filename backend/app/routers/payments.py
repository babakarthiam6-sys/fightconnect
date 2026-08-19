"""Paiements Stripe : création d'intention, historique, webhook."""

from datetime import datetime, timezone
from typing import Any

import stripe
from fastapi import APIRouter, HTTPException, Request, status

from app.config import get_settings
from app.dependencies import CurrentUser, Database
from app.schemas import PaymentIntentOut, PaymentIntentRequest, PaymentList
from app.serializers import serialize_payment, to_object_id
from app.services.payments import (
    create_payment_intent,
    map_stripe_status,
    retrieve_payment_intent,
    retrieve_payment_status,
)

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/create-intent", response_model=PaymentIntentOut)
async def create_intent(
    payload: PaymentIntentRequest,
    database: Database,
    current_user: CurrentUser,
) -> dict[str, Any]:
    sparring_id = to_object_id(payload.sparring_id)
    if sparring_id is None:
        raise HTTPException(status_code=404, detail="Sparring introuvable.")

    sparring = await database.sparrings.find_one({"_id": sparring_id})
    if sparring is None:
        raise HTTPException(status_code=404, detail="Sparring introuvable.")

    price = float(sparring.get("price", 0))
    if price <= 0:
        raise HTTPException(status_code=400, detail="Ce sparring est gratuit.")
    if sparring.get("creator_id") == current_user["_id"]:
        raise HTTPException(status_code=409, detail="Vous êtes l’organisateur de ce sparring.")
    if current_user["_id"] in sparring.get("participant_ids", []):
        raise HTTPException(status_code=409, detail="Vous participez déjà à ce sparring.")

    settings = get_settings()

    # Une intention encore ouverte pour cette même séance est réutilisée : sans
    # cela, chaque retour sur l'écran de paiement en créerait une nouvelle, et
    # deux intentions payées signifieraient deux débits pour une seule place.
    existing = await database.payments.find_one(
        {
            "user_id": current_user["_id"],
            "sparring_id": sparring_id,
            "status": {"$in": ["pending", "processing"]},
            "consumed": {"$ne": True},
        }
    )
    if existing and existing.get("payment_intent_id"):
        reusable = await retrieve_payment_intent(existing["payment_intent_id"])
        if reusable is not None and reusable["status"] not in {"succeeded", "canceled"}:
            return {
                "client_secret": reusable["client_secret"],
                "payment_intent_id": reusable["id"],
                "amount": reusable["amount"],
                "currency": reusable["currency"],
                "publishable_key": settings.stripe_publishable_key or None,
            }

    intent = await create_payment_intent(
        amount=price,
        metadata={
            "sparring_id": str(sparring_id),
            "user_id": str(current_user["_id"]),
        },
    )

    await database.payments.insert_one(
        {
            "user_id": current_user["_id"],
            "sparring_id": sparring_id,
            "sparring_title": sparring.get("title"),
            "payment_intent_id": intent["id"],
            "amount": intent["amount"],
            "currency": intent["currency"],
            "status": "pending",
            "consumed": False,
            "created_at": datetime.now(timezone.utc),
        }
    )

    return {
        "client_secret": intent["client_secret"],
        "payment_intent_id": intent["id"],
        "amount": intent["amount"],
        "currency": intent["currency"],
        "publishable_key": settings.stripe_publishable_key or None,
    }


@router.get("/history", response_model=PaymentList)
async def history(database: Database, current_user: CurrentUser) -> dict[str, Any]:
    documents = [
        document
        async for document in database.payments.find({"user_id": current_user["_id"]}).sort(
            "created_at", -1
        )
    ]

    # Les paiements encore en attente sont resynchronisés à la lecture : le
    # webhook peut ne pas être configuré en développement.
    for document in documents:
        if document.get("status") in {"pending", "processing"} and document.get(
            "payment_intent_id"
        ):
            stripe_status = await retrieve_payment_status(document["payment_intent_id"])
            mapped = map_stripe_status(stripe_status)
            if stripe_status is not None and mapped != document.get("status"):
                document["status"] = mapped
                await database.payments.update_one(
                    {"_id": document["_id"]}, {"$set": {"status": mapped}}
                )

    items = [serialize_payment(document) for document in documents]
    return {"items": items, "total": len(items)}


@router.post("/webhook", include_in_schema=False)
async def stripe_webhook(request: Request, database: Database) -> dict[str, str]:
    """Reçoit les évènements Stripe et met à jour le statut des paiements."""
    settings = get_settings()
    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")

    if not settings.stripe_webhook_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="STRIPE_WEBHOOK_SECRET n’est pas configuré.",
        )

    try:
        event = stripe.Webhook.construct_event(
            payload, signature, settings.stripe_webhook_secret
        )
    except (ValueError, stripe.SignatureVerificationError) as error:
        # Signature invalide : la requête ne vient pas de Stripe.
        raise HTTPException(status_code=400, detail="Signature Stripe invalide.") from error

    intent = event["data"]["object"]
    intent_id = intent.get("id")
    if not intent_id:
        return {"status": "ignored"}

    new_status = {
        "payment_intent.succeeded": "succeeded",
        "payment_intent.payment_failed": "failed",
        "payment_intent.canceled": "cancelled",
        "payment_intent.processing": "processing",
    }.get(event["type"])

    if new_status is None:
        return {"status": "ignored"}

    await database.payments.update_one(
        {"payment_intent_id": intent_id}, {"$set": {"status": new_status}}
    )
    return {"status": "ok"}
