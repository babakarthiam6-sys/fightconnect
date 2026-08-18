"""Inscription, connexion et profil courant."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status

from app.dependencies import CurrentUser, Database
from app.schemas import AuthResponse, LoginRequest, SignupRequest, UserOut
from app.security import create_access_token, hash_password, verify_password
from app.serializers import serialize_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest, database: Database) -> dict:
    if not payload.discharge_accepted:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La décharge de responsabilité doit être acceptée.",
        )

    email = payload.email.lower()
    if await database.users.find_one({"email": email}):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Un compte existe déjà avec cet email.",
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
    user = await database.users.find_one({"email": payload.email.lower()})

    # Message volontairement identique dans les deux cas : distinguer « email
    # inconnu » de « mot de passe faux » permettrait d'énumérer les comptes.
    if user is None or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou mot de passe incorrect.",
        )

    return {
        "access_token": create_access_token(str(user["_id"])),
        "token_type": "bearer",
        "user": serialize_user(user),
    }


@router.get("/me", response_model=UserOut)
async def me(current_user: CurrentUser) -> dict:
    return serialize_user(current_user)
