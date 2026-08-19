"""Statistiques de revenus de l'utilisateur courant."""

from typing import Any

from fastapi import APIRouter

from app.config import get_settings
from app.dependencies import CurrentUser, Database
from app.routers.sparrings import compute_status
from app.schemas import RevenueStatsOut

router = APIRouter(prefix="/revenue", tags=["revenue"])


@router.get("/stats", response_model=RevenueStatsOut)
async def stats(database: Database, current_user: CurrentUser) -> dict[str, Any]:
    settings = get_settings()
    user_id = current_user["_id"]

    my_sparrings = [
        document async for document in database.sparrings.find({"creator_id": user_id})
    ]
    sparring_ids = [document["_id"] for document in my_sparrings]

    # Revenus = paiements aboutis sur mes séances, nets de la commission.
    gross = 0.0
    if sparring_ids:
        async for payment in database.payments.find(
            {"sparring_id": {"$in": sparring_ids}, "status": "succeeded"}
        ):
            gross += float(payment.get("amount", 0))

    net = round(gross * (1 - settings.commission_rate), 2)

    return {
        "total_earnings": net,
        # Pas de système de virement pour l'instant : le solde disponible est
        # égal au cumul des gains.
        "balance": net,
        # Même calcul que sur la fiche : une séance dont l'horaire est passé est
        # terminée, sans qu'aucune tâche planifiée n'ait à la marquer.
        "completed_sparrings": sum(
            1 for document in my_sparrings if compute_status(document) == "completed"
        ),
        "total_sparrings": len(my_sparrings),
        "average_rating": current_user.get("average_rating"),
        "currency": "EUR",
    }
