"""Paiements Stripe : création d'intention, historique, webhook."""

from datetime import datetime, timezone
from typing import Any

import stripe
from fastapi import APIRouter, HTTPException, Request, status

from app.i18n import t
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
    booking_id = to_object_id(payload.booking_id)
    booking = await database.bookings.find_one({"_id": booking_id}) if booking_id else None
    if booking is None:
        raise HTTPException(status_code=404, detail=t("demande.introuvable"))

    if booking.get("requester_id") != current_user["_id"]:
        raise HTTPException(status_code=403, detail=t("demande.pas_la_votre"))
    if booking.get("status") != "accepted":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("paiement.pas_acceptee"),
        )
    if booking.get("paid"):
        raise HTTPException(status_code=409, detail=t("paiement.deja_paye"))

    total = float(booking.get("total", 0))
    if total <= 0:
        raise HTTPException(status_code=400, detail=t("paiement.gratuite"))

    settings = get_settings()

    # Une intention encore ouverte pour cette même demande est réutilisée : sans
    # cela, chaque retour sur l'écran de paiement en créerait une nouvelle, et
    # deux intentions payées signifieraient deux débits pour une seule séance.
    existing = await database.payments.find_one(
        {
            "user_id": current_user["_id"],
            "booking_id": booking["_id"],
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

    # Le partenaire doit pouvoir être payé avant qu'on encaisse quoi que ce
    # soit. Sans cette vérification, la plateforme accumulerait des dettes
    # envers des partenaires sans moyen automatique de les régler.
    partner = await database.users.find_one({"_id": booking.get("partner_id")})
    if partner is None or not partner.get("stripe_payouts_enabled"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("paiement.versements_absents"),
        )

    commission = float(booking.get("commission", 0))

    intent = await create_payment_intent(
        amount=total,
        metadata={
            "booking_id": str(booking["_id"]),
            "user_id": str(current_user["_id"]),
        },
        destination_account=partner.get("stripe_account_id"),
        application_fee=commission,
        currency=booking.get("currency"),
    )

    await database.payments.insert_one(
        {
            "user_id": current_user["_id"],
            "booking_id": booking["_id"],
            "partner_name": f"{partner.get('first_name', '')} {partner.get('last_name', '')}".strip(),
            "payment_intent_id": intent["id"],
            "amount": intent["amount"],
            "currency": intent["currency"],
            "status": "pending",
            "consumed": False,
            "commission": commission,
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
            detail=t("paiement.webhook_absent"),
        )

    try:
        event = stripe.Webhook.construct_event(
            payload, signature, settings.stripe_webhook_secret
        )
    except (ValueError, stripe.SignatureVerificationError) as error:
        # Signature invalide : la requête ne vient pas de Stripe.
        raise HTTPException(status_code=400, detail=t("paiement.signature_invalide")) from error

    objet = event["data"]["object"]

    # Un compte Connect qui change d'état : l'organisateur vient peut-être de
    # terminer son inscription, ou Stripe vient de suspendre ses versements.
    if event["type"] == "account.updated":
        await database.users.update_one(
            {"stripe_account_id": objet.get("id")},
            {
                "$set": {
                    "stripe_details_submitted": bool(objet.get("details_submitted")),
                    "stripe_payouts_enabled": bool(objet.get("payouts_enabled")),
                }
            },
        )
        return {"status": "ok"}

    intent_id = objet.get("id")
    if not intent_id:
        return {"status": "ignored"}

    new_status = {
        "payment_intent.succeeded": "succeeded",
        "payment_intent.payment_failed": "failed",
        "payment_intent.canceled": "cancelled",
        "payment_intent.processing": "processing",
    }.get(event["type"])

    if event["type"] == "charge.refunded":
        await database.payments.update_one(
            {"payment_intent_id": objet.get("payment_intent")},
            {"$set": {"status": "refunded"}},
        )
        return {"status": "ok"}

    if new_status is None:
        return {"status": "ignored"}

    await database.payments.update_one(
        {"payment_intent_id": intent_id}, {"$set": {"status": new_status}}
    )

    # Une demande n'est « payée » que lorsque Stripe l'a confirmé : l'écran de
    # paiement ne suffit pas, l'utilisateur peut le fermer au mauvais moment.
    if new_status == "succeeded":
        booking_id = to_object_id(str(objet.get("metadata", {}).get("booking_id", "")))
        if booking_id is not None:
            await database.bookings.update_one({"_id": booking_id}, {"$set": {"paid": True}})

    return {"status": "ok"}
