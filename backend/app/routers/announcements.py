"""Annonces : « je cherche un sparring », « je cherche un adversaire ».

La recherche montre des profils ; une annonce montre un besoin précis — une
date, un poids, un combat à préparer. Celui qui la lit y répond d'un mot ;
l'auteur choisit parmi les réponses, puis la suite se passe là où elle se passe
déjà : la discussion pour caler les détails, la réservation depuis le profil
pour un sparring payant.

Aucun argent ne circule par une annonce. C'est voulu : elle reste hors du
circuit des paiements et de ses invariants (remboursement avant annulation,
unicité des demandes en attente), qui n'ont pas à connaître son existence.
"""

import re
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, Response, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from app.dependencies import CurrentUser, Database
from app.schemas import (
    ANNOUNCEMENT_KINDS,
    ANNOUNCEMENT_LIFETIME_DAYS,
    LEVELS,
    MAX_OPEN_ANNOUNCEMENTS,
    STYLES,
    WEIGHT_CLASSES,
    AnnouncementCreate,
    AnnouncementList,
    AnnouncementOut,
    AnnouncementReplyCreate,
)
from app.serializers import (
    serialize_announcement,
    serialize_announcement_reply,
    serialize_user_summary,
    to_object_id,
)
from app.services.moderation import moderate_message
from app.services.notifications import send_push
from app.services.videos import identify

router = APIRouter(prefix="/announcements", tags=["annonces"])

# Une date au-delà ne correspond à aucun calendrier de gala réaliste, et
# garderait l'annonce en ligne indéfiniment.
MAX_DAYS_AHEAD = 365

INTROUVABLE = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Annonce introuvable.")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    """Mongo rend des dates naïves en UTC ; mongomock, celles qu'on lui a données."""
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _invalide(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)


def _validated(value: str | None, allowed: tuple[str, ...], label: str) -> str | None:
    """Refuse une valeur inconnue plutôt que d'enregistrer une annonce introuvable."""
    if value is None:
        return None
    if value not in allowed:
        raise _invalide(f"{label} inconnu : {value}.")
    return value


def _parse_date(value: str | None) -> datetime | None:
    if value is None or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise _invalide("Date invalide : format ISO 8601 attendu.") from error
    parsed = _as_utc(parsed)
    if parsed <= _now():
        raise _invalide("La date doit être dans le futur.")
    if parsed > _now() + timedelta(days=MAX_DAYS_AHEAD):
        raise _invalide("La date doit être dans moins d’un an.")
    return parsed


def _clean(value: str | None) -> str | None:
    """Un champ facultatif laissé blanc vaut absent, pas une chaîne vide."""
    if value is None:
        return None
    value = value.strip()
    return value or None


async def _moderate(*texts: str | None) -> None:
    """Même règle que la discussion : un texte signalé n'est pas publié.

    Une annonce est lue par tout le monde. Un numéro de téléphone glissé dedans
    sortirait la transaction de la plateforme pour chacun de ses lecteurs, et
    cela ne se rattrape pas.
    """
    contenu = "\n".join(text for text in texts if text)
    verdict = await moderate_message(contenu)
    if verdict.flagged:
        raise _invalide(
            "Les paiements et les échanges passent par l’application : retirez les "
            "numéros, adresses ou moyens de contact extérieurs."
            if verdict.reason == "payment_bypass"
            else "Ce texte a été signalé par la modération. Reformulez-le."
        )


def _is_open(document: dict[str, Any]) -> bool:
    expires_at = document.get("expires_at")
    return (
        document.get("status") == "open"
        and isinstance(expires_at, datetime)
        and _as_utc(expires_at) > _now()
    )


async def _fetch(database: AsyncIOMotorDatabase, announcement_id: str) -> dict[str, Any]:
    object_id = to_object_id(announcement_id)
    document = await database.announcements.find_one({"_id": object_id}) if object_id else None
    if document is None:
        raise INTROUVABLE
    return document


async def _authors(database: AsyncIOMotorDatabase, ids: set[ObjectId]) -> dict[ObjectId, Any]:
    if not ids:
        return {}
    return {
        person["_id"]: serialize_user_summary(person)
        async for person in database.users.find({"_id": {"$in": list(ids)}})
    }


async def _expand(
    database: AsyncIOMotorDatabase,
    documents: list[dict[str, Any]],
    viewer: dict[str, Any],
) -> list[dict[str, Any]]:
    """Ajoute à chaque annonce son auteur et ce que le lecteur en a déjà fait.

    Trois requêtes en tout, quel que soit le nombre d'annonces : une par
    collection, plutôt qu'une par annonce.
    """
    authors = await _authors(database, {document["author_id"] for document in documents})
    replied = {
        reply["announcement_id"]
        async for reply in database.announcement_replies.find(
            {
                "announcement_id": {"$in": [document["_id"] for document in documents]},
                "author_id": viewer["_id"],
            },
            {"announcement_id": 1},
        )
    }
    return [
        serialize_announcement(
            document,
            authors.get(document["author_id"]),
            viewer_id=viewer["_id"],
            has_replied=document["_id"] in replied,
        )
        for document in documents
    ]


async def _detail(
    database: AsyncIOMotorDatabase, document: dict[str, Any], viewer: dict[str, Any]
) -> dict[str, Any]:
    [result] = await _expand(database, [document], viewer)
    if document["author_id"] == viewer["_id"]:
        replies = [
            reply
            async for reply in database.announcement_replies.find(
                {"announcement_id": document["_id"]}
            ).sort([("created_at", 1), ("_id", 1)])
        ]
        authors = await _authors(database, {reply["author_id"] for reply in replies})
        result["replies"] = [
            serialize_announcement_reply(reply, authors.get(reply["author_id"]))
            for reply in replies
        ]
    return result


@router.get("", response_model=AnnouncementList)
async def list_announcements(
    database: Database,
    current_user: CurrentUser,
    kind: Annotated[str | None, Query()] = None,
    style: Annotated[str | None, Query()] = None,
    weight_class: Annotated[str | None, Query()] = None,
    city: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> dict[str, Any]:
    """Annonces en ligne, les plus récentes d'abord. Les siennes y figurent aussi."""
    query: dict[str, Any] = {"status": "open", "expires_at": {"$gt": _now()}}

    if value := _validated(kind, ANNOUNCEMENT_KINDS, "Type d’annonce"):
        query["kind"] = value
    if value := _validated(style, STYLES, "Sport"):
        query["style"] = value
    if value := _validated(weight_class, WEIGHT_CLASSES, "Catégorie de poids"):
        query["weight_class"] = value
    if city and city.strip():
        query["city"] = {"$regex": f"^{re.escape(city.strip())}", "$options": "i"}

    total = await database.announcements.count_documents(query)
    documents = [
        document
        async for document in database.announcements.find(query)
        .sort([("created_at", -1), ("_id", -1)])
        .skip((page - 1) * limit)
        .limit(limit)
    ]
    return {
        "items": await _expand(database, documents, current_user),
        "total": total,
        "page": page,
        "limit": limit,
    }


# Déclarée avant « /{announcement_id} » : sinon « mine » serait lu comme un
# identifiant d'annonce.
@router.get("/mine", response_model=AnnouncementList)
async def my_announcements(database: Database, current_user: CurrentUser) -> dict[str, Any]:
    """Ses propres annonces, y compris pourvues ou expirées, pour en garder la trace."""
    documents = [
        document
        async for document in database.announcements.find({"author_id": current_user["_id"]})
        .sort([("created_at", -1), ("_id", -1)])
        .limit(50)
    ]
    return {
        "items": await _expand(database, documents, current_user),
        "total": len(documents),
        "page": 1,
        "limit": 50,
    }


@router.post("", response_model=AnnouncementOut, status_code=status.HTTP_201_CREATED)
async def create_announcement(
    payload: AnnouncementCreate, database: Database, current_user: CurrentUser
) -> dict[str, Any]:
    kind = _validated(payload.kind, ANNOUNCEMENT_KINDS, "Type d’annonce")
    style = _validated(payload.style, STYLES, "Sport")
    level = _validated(payload.level, LEVELS, "Niveau")
    weight_class = _validated(payload.weight_class, WEIGHT_CLASSES, "Catégorie de poids")
    scheduled_for = _parse_date(payload.scheduled_for)
    message = payload.message.strip()
    city = payload.city.strip()
    if len(message) < 10:
        raise _invalide("Décrivez ce que vous cherchez en quelques mots (10 caractères au moins).")
    if len(city) < 2:
        raise _invalide("Indiquez une ville.")

    # Le combattant, le palmarès et le poids n'ont de sens que pour un combat.
    fight = kind == "fight"
    fighter_name = _clean(payload.fighter_name) if fight else None
    fighter_record = _clean(payload.fighter_record) if fight else None
    weight_kg = payload.weight_kg if fight else None

    video_url = _clean(payload.video_url)
    video = identify(video_url) if video_url else None
    if video_url and video is None:
        raise _invalide("Lien vidéo non reconnu : YouTube, TikTok ou Instagram uniquement.")

    await _moderate(message, fighter_name, fighter_record)

    now = _now()
    en_ligne = await database.announcements.count_documents(
        {"author_id": current_user["_id"], "status": "open", "expires_at": {"$gt": now}}
    )
    if en_ligne >= MAX_OPEN_ANNOUNCEMENTS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Vous avez déjà {MAX_OPEN_ANNOUNCEMENTS} annonces en ligne. "
                "Clôturez-en une pour en publier une nouvelle."
            ),
        )

    document = {
        "author_id": current_user["_id"],
        "kind": kind,
        "style": style,
        "city": city,
        "level": level,
        "weight_class": weight_class,
        "scheduled_for": scheduled_for,
        "message": message,
        "fighter_name": fighter_name,
        "fighter_record": fighter_record,
        "weight_kg": weight_kg,
        "video_url": video_url,
        "video_provider": video["provider"] if video else None,
        "status": "open",
        "replies_count": 0,
        "created_at": now,
        # Une annonce datée vit jusqu'à sa date ; les autres, un mois.
        "expires_at": scheduled_for or now + timedelta(days=ANNOUNCEMENT_LIFETIME_DAYS),
    }
    result = await database.announcements.insert_one(document)
    document["_id"] = result.inserted_id
    return await _detail(database, document, current_user)


@router.get("/{announcement_id}", response_model=AnnouncementOut)
async def get_announcement(
    announcement_id: str, database: Database, current_user: CurrentUser
) -> dict[str, Any]:
    """Une annonce, même pourvue : on y arrive aussi depuis une notification."""
    document = await _fetch(database, announcement_id)
    return await _detail(database, document, current_user)


@router.post("/{announcement_id}/replies", response_model=AnnouncementOut)
async def reply(
    announcement_id: str,
    payload: AnnouncementReplyCreate,
    database: Database,
    current_user: CurrentUser,
) -> dict[str, Any]:
    document = await _fetch(database, announcement_id)

    if document["author_id"] == current_user["_id"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="On ne répond pas à sa propre annonce.",
        )
    if not _is_open(document):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cette annonce n’accepte plus de réponses.",
        )

    message = payload.message.strip()
    if len(message) < 2:
        raise _invalide("Votre réponse est vide.")
    await _moderate(message)

    identity = {"announcement_id": document["_id"], "author_id": current_user["_id"]}
    # Le cas courant est réglé sans erreur ; deux envois simultanés le sont par
    # l'index unique, qui seul peut trancher entre eux.
    if await database.announcement_replies.find_one(identity) is not None:
        return await _detail(database, document, current_user)
    try:
        await database.announcement_replies.insert_one(
            {**identity, "message": message, "created_at": _now()}
        )
    except DuplicateKeyError:
        return await _detail(database, document, current_user)

    await database.announcements.update_one(
        {"_id": document["_id"]}, {"$inc": {"replies_count": 1}}
    )
    document["replies_count"] = int(document.get("replies_count", 0)) + 1

    author = await database.users.find_one({"_id": document["author_id"]})
    if author is not None:
        await send_push(
            author.get("expo_push_token"),
            title="Nouvelle réponse à votre annonce",
            body=f"{current_user.get('first_name', 'Quelqu’un')} : {message}",
            data={"type": "announcement_reply", "announcement_id": str(document["_id"])},
        )

    return await _detail(database, document, current_user)


async def _own(database: AsyncIOMotorDatabase, announcement_id: str, user: dict[str, Any]):
    document = await _fetch(database, announcement_id)
    if document["author_id"] != user["_id"]:
        # 404 plutôt que 403 : l'annonce d'un autre ne se modifie pas, et il n'y
        # a pas à confirmer qu'elle existe à qui tente de le faire.
        raise INTROUVABLE
    return document


@router.post("/{announcement_id}/close", response_model=AnnouncementOut)
async def close(announcement_id: str, database: Database, current_user: CurrentUser) -> dict[str, Any]:
    """L'auteur a trouvé : l'annonce quitte la liste, ses réponses restent visibles."""
    document = await _own(database, announcement_id, current_user)
    await database.announcements.update_one({"_id": document["_id"]}, {"$set": {"status": "closed"}})
    document["status"] = "closed"
    return await _detail(database, document, current_user)


@router.delete("/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(announcement_id: str, database: Database, current_user: CurrentUser) -> Response:
    document = await _own(database, announcement_id, current_user)
    await database.announcement_replies.delete_many({"announcement_id": document["_id"]})
    await database.announcements.delete_one({"_id": document["_id"]})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def delete_user_announcements(database: AsyncIOMotorDatabase, user_id: ObjectId) -> None:
    """Efface les annonces d'une personne qui supprime son compte, et ses réponses.

    Ses annonces partent avec les réponses qu'elles avaient reçues. Ses réponses
    aux annonces des autres partent aussi, et leur compteur est corrigé : il n'y
    en a qu'une par annonce, l'index l'assure.
    """
    own = [
        document["_id"]
        async for document in database.announcements.find({"author_id": user_id}, {"_id": 1})
    ]
    if own:
        await database.announcement_replies.delete_many({"announcement_id": {"$in": own}})
        await database.announcements.delete_many({"_id": {"$in": own}})

    replied = [
        reply["announcement_id"]
        async for reply in database.announcement_replies.find(
            {"author_id": user_id}, {"announcement_id": 1}
        )
    ]
    if replied:
        await database.announcement_replies.delete_many({"author_id": user_id})
        await database.announcements.update_many(
            {"_id": {"$in": replied}}, {"$inc": {"replies_count": -1}}
        )
