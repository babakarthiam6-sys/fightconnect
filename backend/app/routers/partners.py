"""Recherche et consultation des partenaires de sparring."""

import re
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query, status

from app.i18n import t
from app.dependencies import CurrentUser, Database
from app.geo import normalise_pays
from app.routers.securite import est_bloque, ids_bloques
from app.schemas import LEVELS, STYLES, WEIGHT_CLASSES, PartnerList, PartnerOut
from app.serializers import serialize_partner, to_object_id

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
            detail=t("recherche.filtre_inconnu", label=label, valeur=value),
        )
    return value


@router.get("", response_model=PartnerList)
async def list_partners(
    database: Database,
    current_user: CurrentUser,
    style: Annotated[str | None, Query()] = None,
    level: Annotated[str | None, Query()] = None,
    weight_class: Annotated[str | None, Query()] = None,
    country: Annotated[str | None, Query()] = None,
    city: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> dict[str, Any]:
    # Un profil sans tarif ni discipline n'est pas encore présentable : le
    # proposer ferait perdre son temps à celui qui cherche.
    # Un blocage vaut dans les deux sens : ni le bloqueur ni le bloqué ne doivent
    # se retrouver dans la liste de l'autre. Un blocage à sens unique laisserait
    # le bloqueur croiser le nom qu'il vient d'écarter.
    ecartes = await ids_bloques(database, current_user["_id"])

    query: dict[str, Any] = {
        "_id": {"$nin": [current_user["_id"], *ecartes]},
        "available": True,
        "style": {"$ne": None},
        "price_per_round": {"$ne": None},
    }

    if value := _validated(style, STYLES, t("recherche.filtre.sport")):
        query["style"] = value
    if value := _validated(level, LEVELS, t("recherche.filtre.niveau")):
        query["level"] = value
    if value := _validated(weight_class, WEIGHT_CLASSES, t("recherche.filtre.poids")):
        query["weight_class"] = value
    if country:
        # Le pays d'abord : sans lui, « Paris » ramène la France et le Texas dans
        # la même liste, et une recherche à Dakar remonte des partenaires à Lyon.
        code = normalise_pays(country)
        if code is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=t("compte.pays_inconnu", valeur=country),
            )
        query["country"] = code
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
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("partenaire.introuvable"))

    # Masquer quelqu'un de la recherche sans fermer sa fiche laisserait un lien
    # direct fonctionner, et le blocage ne vaudrait rien. On répond 404 plutôt
    # que 403 : dire « cette personne vous a bloqué » est une information qui ne
    # sert qu'à contourner le blocage.
    if await est_bloque(database, current_user["_id"], document["_id"]):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=t("partenaire.introuvable"))

    return serialize_partner(document)
