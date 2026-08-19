"""Publication, recherche et participation aux sparrings."""

from datetime import datetime, timezone
from typing import Annotated, Any

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.dependencies import CurrentUser, Database
from app.repositories import expand_sparring, expand_sparrings
from app.schemas import LEVELS, STYLES, ReviewList, SparringCreate, SparringList, SparringOut
from app.serializers import serialize_review, to_object_id

router = APIRouter(prefix="/sparrings", tags=["sparrings"])

NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sparring introuvable.")


def parse_scheduled_at(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Date invalide : format ISO 8601 attendu.",
        ) from error

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    if parsed <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La séance doit être programmée dans le futur.",
        )
    return parsed


async def fetch_sparring(database: AsyncIOMotorDatabase, sparring_id: str) -> dict[str, Any]:
    object_id = to_object_id(sparring_id)
    if object_id is None:
        raise NOT_FOUND

    document = await database.sparrings.find_one({"_id": object_id})
    if document is None:
        raise NOT_FOUND
    return document


def compute_status(document: dict[str, Any]) -> str:
    """Le statut « complet » est dérivé du remplissage, jamais stocké en dur."""
    current = document.get("status", "open")
    if current in {"completed", "cancelled"}:
        return current
    if len(document.get("participant_ids", [])) >= int(document.get("max_participants", 2)):
        return "full"
    return "open"


@router.get("", response_model=SparringList)
@router.get("/", response_model=SparringList, include_in_schema=False)
async def list_sparrings(
    database: Database,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    search: str | None = None,
    level: str | None = None,
    style: str | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    creator_id: Annotated[
        str | None, Query(description="Ne renvoyer que les séances de cet organisateur.")
    ] = None,
) -> dict[str, Any]:
    query: dict[str, Any] = {"status": {"$nin": ["cancelled"]}}

    if creator_id is not None:
        creator_object_id = to_object_id(creator_id)
        # Un identifiant illisible ne doit renvoyer aucun résultat plutôt qu'une
        # erreur : c'est une liste filtrée, pas l'accès à une ressource précise.
        if creator_object_id is None:
            return {"items": [], "total": 0, "page": page, "limit": limit}
        query["creator_id"] = creator_object_id

    if search:
        # Recherche insensible à la casse sur les champs que l'utilisateur voit.
        escaped = search.strip()
        query["$or"] = [
            {"title": {"$regex": escaped, "$options": "i"}},
            {"location": {"$regex": escaped, "$options": "i"}},
            {"description": {"$regex": escaped, "$options": "i"}},
        ]
    if level in LEVELS:
        query["level"] = level
    if style in STYLES:
        query["style"] = style
    if min_price is not None or max_price is not None:
        price_filter: dict[str, float] = {}
        if min_price is not None:
            price_filter["$gte"] = min_price
        if max_price is not None:
            price_filter["$lte"] = max_price
        query["price"] = price_filter

    total = await database.sparrings.count_documents(query)
    cursor = (
        database.sparrings.find(query)
        .sort("scheduled_at", 1)
        .skip((page - 1) * limit)
        .limit(limit)
    )
    documents = [document async for document in cursor]
    for document in documents:
        document["status"] = compute_status(document)

    return {
        "items": await expand_sparrings(database, documents),
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.post("", response_model=SparringOut, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=SparringOut, status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def create_sparring(
    payload: SparringCreate,
    database: Database,
    current_user: CurrentUser,
) -> dict[str, Any]:
    if payload.level not in LEVELS:
        raise HTTPException(status_code=422, detail="Niveau inconnu.")
    if payload.style not in STYLES:
        raise HTTPException(status_code=422, detail="Discipline inconnue.")

    document = {
        "title": payload.title.strip(),
        "description": payload.description.strip(),
        "location": payload.location.strip(),
        "scheduled_at": parse_scheduled_at(payload.scheduled_at),
        "duration_minutes": payload.duration_minutes,
        "level": payload.level,
        "style": payload.style,
        "price": round(payload.price, 2),
        "currency": "EUR",
        "max_participants": payload.max_participants,
        "creator_id": current_user["_id"],
        # L'organisateur n'occupe pas une place : elles sont toutes ouvertes
        # aux partenaires.
        "participant_ids": [],
        "status": "open",
        "created_at": datetime.now(timezone.utc),
    }

    result = await database.sparrings.insert_one(document)
    document["_id"] = result.inserted_id
    return await expand_sparring(database, document)


@router.get("/{sparring_id}", response_model=SparringOut)
async def get_sparring(sparring_id: str, database: Database) -> dict[str, Any]:
    document = await fetch_sparring(database, sparring_id)
    document["status"] = compute_status(document)
    return await expand_sparring(database, document)


@router.post("/{sparring_id}/join", response_model=SparringOut)
async def join_sparring(
    sparring_id: str,
    database: Database,
    current_user: CurrentUser,
) -> dict[str, Any]:
    document = await fetch_sparring(database, sparring_id)
    user_id: ObjectId = current_user["_id"]

    if document.get("creator_id") == user_id:
        raise HTTPException(status_code=409, detail="Vous êtes l’organisateur de ce sparring.")
    if user_id in document.get("participant_ids", []):
        raise HTTPException(status_code=409, detail="Vous participez déjà à ce sparring.")
    if document.get("status") in {"completed", "cancelled"}:
        raise HTTPException(status_code=409, detail="Ce sparring n’accepte plus d’inscription.")

    max_participants = int(document.get("max_participants", 2))
    if len(document.get("participant_ids", [])) >= max_participants:
        raise HTTPException(status_code=409, detail="Toutes les places sont prises.")

    # Séance payante : la place n'est accordée qu'une fois le paiement confirmé
    # par Stripe. Sans cette vérification, l'endpoint donnerait accès gratuitement.
    # Le paiement n'est repéré ici que pour être consommé *après* l'inscription :
    # le consommer avant ferait perdre sa place ET son paiement à quelqu'un qui
    # perdrait la course pour la dernière place.
    payment = None
    if float(document.get("price", 0)) > 0:
        payment = await database.payments.find_one(
            {
                "user_id": user_id,
                "sparring_id": document["_id"],
                "status": "succeeded",
                "consumed": {"$ne": True},
            }
        )
        if payment is None:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Le paiement doit être confirmé avant de rejoindre ce sparring.",
            )

    # Inscription atomique : la condition sur l'index `max_participants - 1`
    # n'est vraie que s'il reste une place au moment exact de l'écriture. Deux
    # requêtes simultanées sur la dernière place ne peuvent donc pas réussir
    # toutes les deux, ce qu'un simple `len()` en amont ne garantit pas.
    result = await database.sparrings.update_one(
        {
            "_id": document["_id"],
            f"participant_ids.{max_participants - 1}": {"$exists": False},
            "participant_ids": {"$ne": user_id},
        },
        {"$addToSet": {"participant_ids": user_id}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=409, detail="Toutes les places sont prises.")

    if payment is not None:
        await database.payments.update_one({"_id": payment["_id"]}, {"$set": {"consumed": True}})

    refreshed = await database.sparrings.find_one({"_id": document["_id"]})
    assert refreshed is not None
    refreshed["status"] = compute_status(refreshed)
    return await expand_sparring(database, refreshed)


@router.post("/{sparring_id}/cancel", response_model=SparringOut)
async def cancel_participation(
    sparring_id: str,
    database: Database,
    current_user: CurrentUser,
) -> dict[str, Any]:
    document = await fetch_sparring(database, sparring_id)
    user_id: ObjectId = current_user["_id"]

    if user_id not in document.get("participant_ids", []):
        raise HTTPException(status_code=409, detail="Vous ne participez pas à ce sparring.")

    await database.sparrings.update_one(
        {"_id": document["_id"]}, {"$pull": {"participant_ids": user_id}}
    )

    refreshed = await database.sparrings.find_one({"_id": document["_id"]})
    assert refreshed is not None
    refreshed["status"] = compute_status(refreshed)
    return await expand_sparring(database, refreshed)


@router.get("/{sparring_id}/reviews", response_model=ReviewList)
async def list_reviews(sparring_id: str, database: Database) -> dict[str, Any]:
    document = await fetch_sparring(database, sparring_id)

    reviews = [
        review
        async for review in database.reviews.find({"sparring_id": document["_id"]}).sort(
            "created_at", -1
        )
    ]
    author_ids = [review["author_id"] for review in reviews if review.get("author_id")]
    authors = {
        str(user["_id"]): user
        async for user in database.users.find({"_id": {"$in": author_ids}})
    }

    items = [
        serialize_review(review, authors.get(str(review.get("author_id")))) for review in reviews
    ]
    return {"items": items, "total": len(items)}
