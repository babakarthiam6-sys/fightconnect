"""Recherche et consultation des partenaires de sparring."""

import re
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query, status

from app.dependencies import CurrentUser, Database
from app.schemas import LEVELS, STYLES, WEIGHT_CLASSES, PartnerList, PartnerOut
from app.serializers import serialize_partner, to_object_id
from app.services.safety import NOT_SUSPENDED, has_blocked, hidden_from

router = APIRouter(prefix="/partners", tags=["partenaires"])


def _validated(value: str | None, allowed: tuple[str, ...], label: str) -> str | None:
    """Refuse un filtre inconnu plutôt que de renvoyer une liste vide.

    Une faute de frappe dans un filtre donnerait sinon « aucun résultat », ce que
    l'utilisateur lirait comme « personne ne pratique ce sport ».
    """
    if value is None:
        return None
    if value not in allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{label} inconnu : {value}.",
        )
    return value


@router.get("", response_model=PartnerList)
async def list_partners(
    database: Database,
    current_user: CurrentUser,
    style: Annotated[str | None, Query()] = None,
    level: Annotated[str | None, Query()] = None,
    weight_class: Annotated[str | None, Query()] = None,
    city: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> dict[str, Any]:
    # Un profil sans tarif ni discipline n'est pas encore présentable : le
    # proposer ferait perdre son temps à celui qui cherche.
    # Ni soi-même, ni ceux qu'un blocage sépare de nous, dans un sens ou l'autre.
    hidden = await hidden_from(database, current_user["_id"])
    query: dict[str, Any] = {
        "_id": {"$nin": [current_user["_id"], *hidden]},
        "available": True,
        "style": {"$ne": None},
        "price_per_round": {"$ne": None},
        **NOT_SUSPENDED,
    }

    if value := _validated(style, STYLES, "Sport"):
        query["style"] = value
    if value := _validated(level, LEVELS, "Niveau"):
        query["level"] = value
    if value := _validated(weight_class, WEIGHT_CLASSES, "Catégorie de poids"):
        query["weight_class"] = value
    if city and city.strip():
        # Recherche par préfixe insensible à la casse : « val » trouve Valence.
        # `escape` évite qu'un point ou une parenthèse ne soit pris pour un motif.
        query["city"] = {"$regex": f"^{re.escape(city.strip())}", "$options": "i"}

    total = await database.users.count_documents(query)
    cursor = (
        database.users.find(query)
        .sort([("average_rating", -1), ("created_at", -1)])
        .skip((page - 1) * limit)
        .limit(limit)
    )

    return {
        "items": [serialize_partner(document) async for document in cursor],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.get("/{partner_id}", response_model=PartnerOut)
async def get_partner(
    partner_id: str, database: Database, current_user: CurrentUser
) -> dict[str, Any]:
    object_id = to_object_id(partner_id)
    document = await database.users.find_one({"_id": object_id}) if object_id else None
    # Celui qui nous a bloqués n'existe plus pour nous, comme un compte suspendu.
    if (
        document is None
        or document.get("suspended")
        or await has_blocked(database, document["_id"], current_user["_id"])
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Partenaire introuvable.")
    return {
        **serialize_partner(document),
        "is_blocked": await has_blocked(database, current_user["_id"], document["_id"]),
    }
