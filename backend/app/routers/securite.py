"""Signalement et blocage.

Pourquoi ces routes existent
-----------------------------

Toute application qui laisse ses utilisateurs s'écrire doit, chez Apple comme
chez Google, offrir trois choses : un filtrage des contenus, un moyen de
**signaler** un abus, et un moyen de **bloquer** la personne. La modération
existait déjà ici ; les deux autres manquaient. C'est le motif de rejet le plus
courant pour une application sociale, et un motif de retrait si un utilisateur
se plaint après publication.

La différence entre les deux
-----------------------------

Signaler est une demande adressée à la plateforme : *regardez ça*. C'est
asynchrone, ça n'a aucun effet immédiat, et ça ne dit rien à la personne visée.

Bloquer est une décision personnelle, immédiate et sans recours : *je ne veux
plus rien recevoir de cette personne*. Elle prend effet des deux côtés — un
blocage à sens unique laisserait le bloqueur voir sa cible dans la recherche,
ce qui n'a pas de sens, et lui permettrait de la réserver.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any

from bson import ObjectId
from fastapi import APIRouter, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.dependencies import CurrentUser, Database
from app.i18n import t
from app.serializers import to_object_id

router = APIRouter(prefix="/securite", tags=["sécurité"])

# Ce qu'on peut signaler. Fermé volontairement : un champ libre laisserait
# arriver n'importe quel identifiant et transformerait la file de modération en
# dépotoir.
CIBLES = ("user", "message", "review")

# Motifs proposés. La liste est courte : au-delà de cinq choix, personne ne lit
# et tout le monde prend le premier.
MOTIFS = ("harcelement", "contenu_haineux", "arnaque", "hors_plateforme", "autre")


class ReportCreate(BaseModel):
    target_type: str
    target_id: str
    reason: str
    details: str | None = Field(default=None, max_length=1000)


async def est_bloque(
    database: AsyncIOMotorDatabase, un: ObjectId, autre: ObjectId
) -> bool:
    """Vrai si l'un des deux a bloqué l'autre, dans un sens ou dans l'autre."""
    trouve = await database.blocks.find_one(
        {
            "$or": [
                {"blocker_id": un, "blocked_id": autre},
                {"blocker_id": autre, "blocked_id": un},
            ]
        }
    )
    return trouve is not None


async def ids_bloques(database: AsyncIOMotorDatabase, user_id: ObjectId) -> list[ObjectId]:
    """Tous les comptes à masquer à cette personne, dans les deux sens."""
    curseur = database.blocks.find(
        {"$or": [{"blocker_id": user_id}, {"blocked_id": user_id}]}
    )
    autres: list[ObjectId] = []
    async for lien in curseur:
        autres.append(
            lien["blocked_id"] if lien["blocker_id"] == user_id else lien["blocker_id"]
        )
    return autres


@router.post("/reports", status_code=status.HTTP_201_CREATED)
async def signaler(
    payload: ReportCreate,
    database: Database,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """Enregistre un signalement.

    Ne renvoie rien de la cible, et ne la prévient pas : un signalement qui
    remonterait à la personne visée exposerait celui qui l'a écrit, et plus
    personne n'oserait signaler.
    """
    if payload.target_type not in CIBLES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("securite.cible_inconnue", valeur=payload.target_type),
        )
    if payload.reason not in MOTIFS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("securite.motif_inconnu", valeur=payload.reason),
        )

    cible = to_object_id(payload.target_id)
    if payload.target_type == "user" and cible == current_user["_id"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("securite.pas_soi_meme"),
        )

    # Un seul signalement par personne et par cible : réappuyer sur le bouton
    # ne doit pas gonfler artificiellement un compteur que la modération lit.
    await database.reports.update_one(
        {
            "reporter_id": current_user["_id"],
            "target_type": payload.target_type,
            "target_id": cible,
        },
        {
            "$set": {
                "reason": payload.reason,
                "details": (payload.details or "").strip() or None,
                "updated_at": datetime.now(timezone.utc),
            },
            "$setOnInsert": {
                "status": "open",
                "created_at": datetime.now(timezone.utc),
            },
        },
        upsert=True,
    )

    return {"signale": True}


@router.post("/blocks/{user_id}", status_code=status.HTTP_201_CREATED)
async def bloquer(
    user_id: str,
    database: Database,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """Bloque une personne, dans les deux sens.

    Le blocage annule aussi les demandes encore vivantes entre les deux : les
    laisser en attente obligerait le bloqueur à croiser encore le nom de
    quelqu'un qu'il vient d'écarter.
    """
    cible = to_object_id(user_id)
    if cible == current_user["_id"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("securite.pas_soi_meme"),
        )

    autre = await database.users.find_one({"_id": cible})
    if autre is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=t("compte.introuvable")
        )

    await database.blocks.update_one(
        {"blocker_id": current_user["_id"], "blocked_id": cible},
        {"$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )

    annulees = await database.bookings.update_many(
        {
            "$or": [
                {"requester_id": current_user["_id"], "partner_id": cible},
                {"requester_id": cible, "partner_id": current_user["_id"]},
            ],
            "status": {"$in": ["pending", "accepted"]},
            "paid": {"$ne": True},
        },
        {"$set": {"status": "cancelled", "cancelled_at": datetime.now(timezone.utc)}},
    )

    return {"bloque": True, "demandes_annulees": int(annulees.modified_count)}


@router.delete("/blocks/{user_id}")
async def debloquer(
    user_id: str,
    database: Database,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """Retire un blocage. Ne ressuscite aucune demande annulée."""
    resultat = await database.blocks.delete_one(
        {"blocker_id": current_user["_id"], "blocked_id": to_object_id(user_id)}
    )
    return {"bloque": False, "supprime": resultat.deleted_count > 0}


@router.get("/blocks")
async def liste_des_blocages(
    database: Database,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """Comptes bloqués par cette personne — pas ceux qui l'ont bloquée.

    Savoir qui vous a bloqué est une information qu'aucune application sérieuse
    ne donne : elle sert surtout à contourner le blocage.
    """
    curseur = database.blocks.find({"blocker_id": current_user["_id"]})
    ids = [lien["blocked_id"] async for lien in curseur]
    if not ids:
        return {"items": [], "total": 0}

    profils = database.users.find({"_id": {"$in": ids}})
    items = [
        {
            "id": str(profil["_id"]),
            "first_name": profil.get("first_name", ""),
            "last_name": profil.get("last_name", ""),
            "avatar_url": profil.get("avatar_url"),
        }
        async for profil in profils
    ]
    return {"items": items, "total": len(items)}
