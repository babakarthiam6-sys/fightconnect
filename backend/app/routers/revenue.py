"""Statistiques de revenus de l'utilisateur courant."""

from typing import Any

from fastapi import APIRouter

from app.dependencies import CurrentUser, Database
from app.schemas import RevenueStatsOut

router = APIRouter(prefix="/revenue", tags=["revenue"])


@router.get("/stats", response_model=RevenueStatsOut)
async def stats(database: Database, current_user: CurrentUser) -> dict[str, Any]:
    user_id = current_user["_id"]

    my_bookings = [
        document async for document in database.bookings.find({"partner_id": user_id})
    ]

    # Revenus = part partenaire des séances effectivement payées. Le montant net
    # est figé dans la demande au moment de sa création : recalculer la
    # commission ici ferait varier a posteriori ce qui a déjà été facturé si le
    # taux de la plateforme changeait.
    net = round(
        sum(
            float(document.get("payout", 0))
            for document in my_bookings
            if document.get("paid") and document.get("status") in {"accepted", "completed"}
        ),
        2,
    )

    return {
        "total_earnings": net,
        # Pas de système de virement pour l'instant : le solde disponible est
        # égal au cumul des gains.
        "balance": net,
        "completed_bookings": sum(
            1 for document in my_bookings if document.get("status") == "completed"
        ),
        "total_bookings": len(my_bookings),
        "average_rating": current_user.get("average_rating"),
        "currency": current_user.get("currency", "EUR"),
    }
