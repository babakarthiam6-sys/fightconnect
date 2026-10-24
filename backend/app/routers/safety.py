"""Signaler, bloquer, modérer.

Google Play l'exige de toute application où l'on s'écrit et où l'on publie :
chacun doit pouvoir signaler une personne ou un contenu, et bloquer quelqu'un,
depuis l'application ; et l'équipe doit pouvoir agir sur ces signalements.

Le blocage est immédiat et ne dépend de personne. Le signalement, lui, attend
la décision d'un administrateur (défini par e-mail, voir `ADMIN_EMAILS`) :
classer, retirer le contenu, ou suspendre le compte.
"""

from datetime import datetime, timezone
from typing import Annotated, Any

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, Response, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from app.config import get_settings
from app.dependencies import AdminUser, CurrentUser, Database
from app.schemas import (
    REPORT_ACTIONS,
    REPORT_REASONS,
    REPORT_TARGETS,
    BlockCreate,
    BlockedList,
    ReportAck,
    ReportCreate,
    ReportList,
    ReportOut,
    ReportResolve,
)
from app.serializers import iso, serialize_user_summary, to_object_id
from app.services.chat import registry
from app.services.notifications import send_push

router = APIRouter(tags=["sécurité"])

INTROUVABLE = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable.")
CONTENU_INTROUVABLE = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contenu introuvable.")

# Un extrait suffit à juger ; au-delà, l'écran de modération devient illisible.
EXCERPT_LENGTH = 500


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _invalide(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)


async def _other_user(database: AsyncIOMotorDatabase, user_id: str, me: dict[str, Any]) -> dict[str, Any]:
    object_id = to_object_id(user_id)
    other = await database.users.find_one({"_id": object_id}) if object_id else None
    if other is None:
        raise INTROUVABLE
    if other["_id"] == me["_id"]:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cela vous concerne vous-même.")
    return other


# --- Blocages ---------------------------------------------------------------


@router.get("/blocks", response_model=BlockedList)
async def list_blocks(database: Database, current_user: CurrentUser) -> dict[str, Any]:
    """Les personnes que l'on a bloquées, pour pouvoir les débloquer."""
    ids = [
        block["blocked_id"]
        async for block in database.blocks.find({"blocker_id": current_user["_id"]}).sort(
            "created_at", -1
        )
    ]
    people = {
        person["_id"]: serialize_user_summary(person)
        async for person in database.users.find({"_id": {"$in": ids}})
    }
    return {"items": [people[i] for i in ids if i in people]}


@router.post("/blocks", response_model=BlockedList, status_code=status.HTTP_201_CREATED)
async def block(payload: BlockCreate, database: Database, current_user: CurrentUser) -> dict[str, Any]:
    other = await _other_user(database, payload.user_id, current_user)
    # Bloquer deux fois ne fait rien de plus : l'index unique garde un seul blocage.
    try:
        await database.blocks.update_one(
            {"blocker_id": current_user["_id"], "blocked_id": other["_id"]},
            {"$setOnInsert": {"created_at": _now()}},
            upsert=True,
        )
    except DuplicateKeyError:
        pass
    return await list_blocks(database, current_user)


@router.delete("/blocks/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unblock(user_id: str, database: Database, current_user: CurrentUser) -> Response:
    object_id = to_object_id(user_id)
    if object_id is not None:
        await database.blocks.delete_one({"blocker_id": current_user["_id"], "blocked_id": object_id})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Signalements -----------------------------------------------------------


def _excerpt(text: str | None) -> str | None:
    if not text:
        return None
    text = text.strip()
    return text[:EXCERPT_LENGTH] + ("…" if len(text) > EXCERPT_LENGTH else "")


async def _target(
    database: AsyncIOMotorDatabase,
    target_type: str,
    target_id: str | None,
    reported: dict[str, Any],
    me: dict[str, Any],
) -> tuple[ObjectId | None, str | None]:
    """Vérifie que le contenu existe, est bien de la personne signalée, et que
    celui qui signale a pu le voir. Renvoie son identifiant et un extrait."""
    if target_type == "user":
        profil = " — ".join(
            part
            for part in (
                f"{reported.get('first_name', '')} {reported.get('last_name', '')}".strip(),
                reported.get("bio"),
            )
            if part
        )
        return None, _excerpt(profil)

    object_id = to_object_id(target_id or "")
    if object_id is None:
        raise CONTENU_INTROUVABLE

    if target_type == "message":
        # On ne signale que ce qu'on a reçu : un message entre deux autres
        # personnes ne se voit pas.
        message = await database.messages.find_one(
            {"_id": object_id, "sender_id": reported["_id"], "recipient_id": me["_id"]}
        )
        if message is None:
            raise CONTENU_INTROUVABLE
        return object_id, _excerpt(message.get("content"))

    if target_type == "announcement":
        annonce = await database.announcements.find_one({"_id": object_id, "author_id": reported["_id"]})
        if annonce is None:
            raise CONTENU_INTROUVABLE
        return object_id, _excerpt(annonce.get("message"))

    # Réponse à une annonce : seul l'auteur de l'annonce la voit, lui seul la signale.
    reponse = await database.announcement_replies.find_one(
        {"_id": object_id, "author_id": reported["_id"]}
    )
    if reponse is None or not await database.announcements.find_one(
        {"_id": reponse["announcement_id"], "author_id": me["_id"]}
    ):
        raise CONTENU_INTROUVABLE
    return object_id, _excerpt(reponse.get("message"))


async def _notify_admins(database: AsyncIOMotorDatabase) -> None:
    emails = get_settings().admin_email_list
    if not emails:
        return
    async for admin in database.users.find({"email": {"$in": emails}}, {"expo_push_token": 1}):
        await send_push(
            admin.get("expo_push_token"),
            title="Nouveau signalement",
            body="Un contenu ou un utilisateur a été signalé. Ouvrez Signalements pour décider.",
            data={"type": "report"},
        )


@router.post("/reports", response_model=ReportAck, status_code=status.HTTP_201_CREATED)
async def create_report(payload: ReportCreate, database: Database, current_user: CurrentUser) -> dict[str, Any]:
    if payload.target_type not in REPORT_TARGETS:
        raise _invalide(f"Type de contenu inconnu : {payload.target_type}.")
    if payload.reason not in REPORT_REASONS:
        raise _invalide(f"Motif inconnu : {payload.reason}.")

    reported = await _other_user(database, payload.user_id, current_user)
    target_id, excerpt = await _target(
        database, payload.target_type, payload.target_id, reported, current_user
    )

    identity = {
        "reporter_id": current_user["_id"],
        "reported_user_id": reported["_id"],
        "target_type": payload.target_type,
        "target_id": target_id,
    }
    # Signaler deux fois la même chose n'ajoute rien : le premier signalement
    # attend déjà une décision. L'index unique tranche entre deux envois simultanés.
    existing = await database.reports.find_one({**identity, "status": "open"})
    if existing is not None:
        return {"id": str(existing["_id"]), "status": "open"}

    details = (payload.details or "").strip() or None
    try:
        result = await database.reports.insert_one(
            {
                **identity,
                "reason": payload.reason,
                "details": details,
                "excerpt": excerpt,
                "status": "open",
                "created_at": _now(),
            }
        )
    except DuplicateKeyError:
        winner = await database.reports.find_one({**identity, "status": "open"})
        if winner is None:
            raise
        return {"id": str(winner["_id"]), "status": "open"}

    await _notify_admins(database)
    return {"id": str(result.inserted_id), "status": "open"}


# --- Modération (administrateurs) -------------------------------------------


async def _serialize_reports(
    database: AsyncIOMotorDatabase, documents: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    ids = {d["reporter_id"] for d in documents} | {d["reported_user_id"] for d in documents}
    people = {p["_id"]: p async for p in database.users.find({"_id": {"$in": list(ids)}})}
    counts = {
        user_id: await database.reports.count_documents(
            {"reported_user_id": user_id, "status": "open"}
        )
        for user_id in {d["reported_user_id"] for d in documents}
    }
    out = []
    for document in documents:
        reported = people.get(document["reported_user_id"])
        out.append(
            {
                "id": str(document["_id"]),
                "target_type": document.get("target_type", "user"),
                "target_id": str(document["target_id"]) if document.get("target_id") else None,
                "reason": document.get("reason", "other"),
                "details": document.get("details"),
                "excerpt": document.get("excerpt"),
                "status": document.get("status", "open"),
                "resolution": document.get("resolution"),
                "created_at": iso(document.get("created_at")),
                "reporter": serialize_user_summary(people.get(document["reporter_id"])),
                "reported": serialize_user_summary(reported),
                "reported_open_reports": counts.get(document["reported_user_id"], 0),
                "reported_suspended": bool(reported and reported.get("suspended")),
            }
        )
    return out


@router.get("/moderation/reports", response_model=ReportList)
async def list_reports(
    database: Database,
    _: AdminUser,
    status_filter: Annotated[str, Query(alias="status")] = "open",
) -> dict[str, Any]:
    """Signalements à traiter, les plus anciens d'abord : ils attendent depuis le plus longtemps."""
    if status_filter not in ("open", "resolved"):
        raise _invalide("Statut inconnu.")
    order = 1 if status_filter == "open" else -1
    documents = [
        document
        async for document in database.reports.find({"status": status_filter})
        .sort([("created_at", order), ("_id", order)])
        .limit(100)
    ]
    items = await _serialize_reports(database, documents)
    return {"items": items, "total": len(items)}


async def _remove_content(database: AsyncIOMotorDatabase, report: dict[str, Any]) -> None:
    target_type = report.get("target_type")
    target_id = report.get("target_id")
    if target_type == "message":
        await database.messages.delete_one({"_id": target_id})
    elif target_type == "announcement":
        await database.announcement_replies.delete_many({"announcement_id": target_id})
        await database.announcements.delete_one({"_id": target_id})
    elif target_type == "announcement_reply":
        reponse = await database.announcement_replies.find_one_and_delete({"_id": target_id})
        if reponse is not None:
            await database.announcements.update_one(
                {"_id": reponse["announcement_id"]}, {"$inc": {"replies_count": -1}}
            )
    else:
        # Pour un profil, le contenu public est la présentation et les vidéos.
        await database.users.update_one(
            {"_id": report["reported_user_id"]}, {"$set": {"bio": None, "videos": []}}
        )


async def suspend_user(database: AsyncIOMotorDatabase, user: dict[str, Any], admin: dict[str, Any]) -> None:
    """Suspend un compte : il ne peut plus se connecter et disparaît de l'application.

    Ses annonces en ligne sont closes et sa connexion temps réel coupée. Ses
    séances, elles, ne sont pas touchées : annuler un paiement relève d'une
    décision au cas par cas, pas d'un geste de modération.
    """
    now = _now()
    await database.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"suspended": True, "suspended_at": now, "available": False}},
    )
    await database.announcements.update_many(
        {"author_id": user["_id"], "status": "open"}, {"$set": {"status": "closed"}}
    )
    await database.reports.update_many(
        {"reported_user_id": user["_id"], "status": "open"},
        {"$set": {"status": "resolved", "resolution": "suspend", "resolved_at": now, "resolved_by": admin["_id"]}},
    )
    await registry.close_all(str(user["_id"]))


@router.post("/moderation/reports/{report_id}/resolve", response_model=ReportOut)
async def resolve_report(
    report_id: str, payload: ReportResolve, database: Database, admin: AdminUser
) -> dict[str, Any]:
    if payload.action not in REPORT_ACTIONS:
        raise _invalide(f"Décision inconnue : {payload.action}.")
    object_id = to_object_id(report_id)
    report = await database.reports.find_one({"_id": object_id}) if object_id else None
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Signalement introuvable.")

    if payload.action == "suspend":
        reported = await database.users.find_one({"_id": report["reported_user_id"]})
        if reported is None:
            raise INTROUVABLE
        if get_settings().is_admin_email(reported.get("email")):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Un administrateur ne peut pas être suspendu depuis l’application.",
            )
        await suspend_user(database, reported, admin)
    elif payload.action == "remove_content":
        await _remove_content(database, report)

    await database.reports.update_one(
        {"_id": report["_id"]},
        {
            "$set": {
                "status": "resolved",
                "resolution": payload.action,
                "resolved_at": _now(),
                "resolved_by": admin["_id"],
            }
        },
    )
    refreshed = await database.reports.find_one({"_id": report["_id"]})
    [result] = await _serialize_reports(database, [refreshed])
    return result


@router.post("/moderation/users/{user_id}/unsuspend", status_code=status.HTTP_204_NO_CONTENT)
async def unsuspend(user_id: str, database: Database, _: AdminUser) -> Response:
    """Lève une suspension prononcée par erreur. Le compte se reconnecte normalement."""
    object_id = to_object_id(user_id)
    result = await database.users.update_one(
        {"_id": object_id}, {"$set": {"suspended": False}, "$unset": {"suspended_at": ""}}
    ) if object_id else None
    if result is None or result.matched_count == 0:
        raise INTROUVABLE
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def delete_user_safety_data(database: AsyncIOMotorDatabase, user_id: ObjectId) -> None:
    """À la suppression d'un compte : ses blocages, dans les deux sens, et les
    signalements qu'il a faits ou qui le visaient."""
    await database.blocks.delete_many({"$or": [{"blocker_id": user_id}, {"blocked_id": user_id}]})
    await database.reports.delete_many(
        {"$or": [{"reporter_id": user_id}, {"reported_user_id": user_id}]}
    )
