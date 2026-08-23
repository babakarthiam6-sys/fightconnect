"""Inscription, connexion et profil courant."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status

from app.i18n import t
from app.dependencies import CurrentUser, Database
from app.geo import CURRENCIES, DEFAULT_CURRENCY, devise_par_defaut, normalise_pays, tarif_max
from app.schemas import (
    LEVELS,
    STYLES,
    WEIGHT_CLASSES,
    AuthResponse,
    LoginRequest,
    ProfileUpdate,
    SignupRequest,
    UserOut,
)
from app.security import create_access_token, hash_password, verify_password
from app.serializers import serialize_user
from app.services import throttle

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest, database: Database) -> dict:
    if not payload.discharge_accepted:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("compte.decharge_obligatoire"),
        )

    email = payload.email.lower()
    if await database.users.find_one({"email": email}):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("compte.email_pris"),
        )

    document = {
        "email": email,
        "password_hash": hash_password(payload.password),
        "first_name": payload.first_name.strip(),
        "last_name": payload.last_name.strip(),
        "avatar_url": None,
        "discharge_accepted": True,
        "average_rating": None,
        "ratings_count": 0,
        # Le profil sportif se remplit ensuite, depuis l'onglet Profil. Tant
        # qu'il manque une discipline et un tarif, le compte n'apparaît pas
        # dans les recherches : personne ne peut réserver dans le vide.
        "city": None,
        "country": None,
        "bio": None,
        "style": None,
        "level": None,
        "weight_class": None,
        "height_cm": None,
        "fights_count": 0,
        "experience_years": 0,
        "price_per_round": None,
        "currency": "EUR",
        "available": False,
        "expo_push_token": None,
        "created_at": datetime.now(timezone.utc),
    }
    result = await database.users.insert_one(document)
    document["_id"] = result.inserted_id

    return {
        "access_token": create_access_token(str(result.inserted_id)),
        "token_type": "bearer",
        "user": serialize_user(document),
    }


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, database: Database) -> dict:
    email = payload.email.lower()

    # Un mot de passe se teste par millions si rien ne freine les tentatives.
    remaining = await throttle.seconds_until_unlock(database, email)
    if remaining > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=t("compte.trop_de_tentatives"),
            headers={"Retry-After": str(remaining)},
        )

    user = await database.users.find_one({"email": email})

    # Message volontairement identique dans les deux cas : distinguer « email
    # inconnu » de « mot de passe faux » permettrait d'énumérer les comptes.
    if user is None or not verify_password(payload.password, user.get("password_hash", "")):
        await throttle.register_failure(database, email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=t("compte.identifiants_invalides"),
        )

    await throttle.clear(database, email)

    return {
        "access_token": create_access_token(str(user["_id"])),
        "token_type": "bearer",
        "user": serialize_user(user),
    }


@router.get("/me", response_model=UserOut)
async def me(current_user: CurrentUser) -> dict:
    return serialize_user(current_user)


ALLOWED_VALUES = {
    "style": STYLES,
    "level": LEVELS,
    "weight_class": WEIGHT_CLASSES,
}


@router.patch("/me", response_model=UserOut)
async def update_me(
    payload: ProfileUpdate,
    database: Database,
    current_user: CurrentUser,
) -> dict:
    """Met à jour le profil sportif.

    Seuls les champs fournis sont écrits : l'écran de profil enregistre une
    ligne à la fois, et un `null` explicite doit pouvoir effacer une valeur.
    """
    changes = payload.model_dump(exclude_unset=True)

    for field, allowed in ALLOWED_VALUES.items():
        value = changes.get(field)
        if value is not None and value not in allowed:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=t("compte.valeur_inconnue", champ=field, valeur=value),
            )

    if changes.get("country") is not None:
        pays = normalise_pays(changes["country"])
        if pays is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=t("compte.pays_inconnu", valeur=changes["country"]),
            )
        changes["country"] = pays
        # Déclarer son pays sans avoir touché à sa devise propose celle du lieu :
        # un boxeur à Londres ne devrait pas corriger « EUR » à la main. Un choix
        # explicite, lui, n'est jamais écrasé.
        if "currency" not in changes and current_user.get("price_per_round") is None:
            changes["currency"] = devise_par_defaut(pays)

    if changes.get("currency") is not None:
        devise = changes["currency"].strip().upper()
        if devise not in CURRENCIES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=t("compte.devise_inconnue", valeur=changes["currency"]),
            )
        changes["currency"] = devise

    tarif = changes.get("price_per_round")
    if tarif is not None:
        devise = changes.get("currency") or current_user.get("currency") or DEFAULT_CURRENCY
        plafond = tarif_max(devise)
        if tarif > plafond:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=t("compte.tarif_trop_eleve", plafond=f"{plafond:.0f}", devise=devise),
            )

    for field in ("first_name", "last_name", "city", "bio"):
        if isinstance(changes.get(field), str):
            changes[field] = changes[field].strip() or None

    # Se rendre disponible sans discipline ni tarif produirait une fiche que
    # personne ne peut ni filtrer ni réserver.
    merged = {**current_user, **changes}
    if merged.get("available") and (merged.get("style") is None or merged.get("price_per_round") is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=t("compte.profil_incomplet"),
        )

    if changes:
        await database.users.update_one({"_id": current_user["_id"]}, {"$set": changes})

    refreshed = await database.users.find_one({"_id": current_user["_id"]})
    assert refreshed is not None
    return serialize_user(refreshed)
