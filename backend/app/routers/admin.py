"""Fenêtre de surveillance, en lecture seule.

Ce que ces routes montrent, et ce qu'elles taisent
--------------------------------------------------

Elles répondent à une seule question : *est-ce que l'application vit ?* Nombre
de comptes, de profils remplis, de demandes par état, de messages, et ce que la
modération a bloqué. Des **compteurs**, jamais des personnes : aucun email,
aucun nom, aucun message, aucun identifiant de compte ne sort d'ici. Surveiller
la santé d'un service n'exige pas de lire le courrier de ses utilisateurs, et
une route d'administration qui le permettrait finirait par servir à ça.

L'accès tient à un jeton, `ADMIN_TOKEN`, comparé en temps constant. Sans ce
jeton dans l'environnement, le routeur n'est pas monté du tout : une porte qui
n'existe pas ne s'ouvre pas par erreur de configuration.

Aucune route n'écrit. C'est délibéré : le jour où il faudra corriger une donnée,
cela se fera ailleurs, à visage découvert, et non par un canal conçu pour
regarder.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.config import get_settings
from app.dependencies import Database


async def exige_le_jeton(x_admin_token: Annotated[str | None, Header()] = None) -> None:
    """Compare le jeton en temps constant.

    `secrets.compare_digest` plutôt que `==` : une comparaison ordinaire s'arrête
    au premier caractère faux, et le temps qu'elle met révèle la longueur du
    préfixe correct. C'est peu, mais c'est gratuit à corriger.
    """
    attendu = get_settings().admin_token
    if not attendu or not x_admin_token or not secrets.compare_digest(x_admin_token, attendu):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Jeton de surveillance invalide.",
        )


router = APIRouter(
    prefix="/admin",
    tags=["surveillance"],
    dependencies=[Depends(exige_le_jeton)],
)


async def _compte(collection: Any, requete: dict[str, Any] | None = None) -> int:
    return int(await collection.count_documents(requete or {}))


async def _repartition(collection: Any, champ: str, filtre: dict[str, Any]) -> dict[str, int]:
    """Combien de profils par pays, par discipline. Des nombres, pas des noms."""
    curseur = collection.aggregate(
        [
            {"$match": {**filtre, champ: {"$ne": None}}},
            {"$group": {"_id": f"${champ}", "n": {"$sum": 1}}},
            {"$sort": {"n": -1}},
            {"$limit": 20},
        ]
    )
    return {str(ligne["_id"]): int(ligne["n"]) async for ligne in curseur}


async def _argent(bookings: Any) -> dict[str, Any]:
    """Volume et commission des séances réellement payées.

    Seules comptent les demandes payées : additionner des demandes en attente
    donnerait un chiffre d'affaires imaginaire, et c'est exactement le genre de
    chiffre qu'on finit par croire.
    """
    curseur = bookings.aggregate(
        [
            {"$match": {"paid": True}},
            {
                "$group": {
                    "_id": "$currency",
                    "total": {"$sum": "$total"},
                    "commission": {"$sum": "$commission"},
                    "n": {"$sum": 1},
                }
            },
        ]
    )
    return {
        str(ligne["_id"] or "EUR"): {
            "seances": int(ligne["n"]),
            "volume": round(float(ligne["total"]), 2),
            "commission": round(float(ligne["commission"]), 2),
        }
        async for ligne in curseur
    }


@router.get("/overview")
async def overview(database: Database) -> dict[str, Any]:
    """Photographie de l'application, en compteurs.

    Le découpage à sept jours n'est pas décoratif : c'est la seule ligne qui dit
    si le produit vit ou s'il est simplement né. Un total qui monte sans activité
    récente décrit un cimetière.
    """
    maintenant = datetime.now(timezone.utc)
    semaine = maintenant - timedelta(days=7)

    users = database.users
    bookings = database.bookings

    profils_complets: dict[str, Any] = {"style": {"$ne": None}, "price_per_round": {"$ne": None}}
    etats = ("pending", "accepted", "declined", "cancelled", "completed")

    return {
        "horodatage": maintenant.isoformat(),
        "comptes": {
            "total": await _compte(users),
            "profil_rempli": await _compte(users, profils_complets),
            "visibles": await _compte(users, {**profils_complets, "available": True}),
            "versements_actifs": await _compte(users, {"stripe_payouts_enabled": True}),
            "nouveaux_7j": await _compte(users, {"created_at": {"$gte": semaine}}),
        },
        "pays": await _repartition(users, "country", profils_complets),
        "disciplines": await _repartition(users, "style", profils_complets),
        "demandes": {
            **{etat: await _compte(bookings, {"status": etat}) for etat in etats},
            "total": await _compte(bookings),
            "nouvelles_7j": await _compte(bookings, {"created_at": {"$gte": semaine}}),
            "payees": await _compte(bookings, {"paid": True}),
        },
        "discussion": {
            "messages": await _compte(database.messages),
            "messages_7j": await _compte(database.messages, {"created_at": {"$gte": semaine}}),
            "non_lus": await _compte(database.messages, {"read": False}),
        },
        "moderation": {
            "avis": await _compte(database.reviews),
            "avis_signales": await _compte(database.reviews, {"flagged": True}),
        },
        "argent": await _argent(bookings),
    }
