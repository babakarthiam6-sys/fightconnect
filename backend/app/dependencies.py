"""Dépendances partagées : base de données et utilisateur authentifié."""

from typing import Annotated, Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import get_settings
from app.database import get_database
from app.security import decode_access_token
from app.serializers import to_object_id

_bearer = HTTPBearer(auto_error=False)

Database = Annotated[AsyncIOMotorDatabase, Depends(get_database)]

CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Session expirée, reconnectez-vous.",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    database: Database,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)] = None,
) -> dict[str, Any]:
    """Résout le porteur du jeton. Lève 401 dès que quoi que ce soit cloche.

    Le client mobile purge sa session sur 401 : ce statut doit donc être réservé
    aux jetons réellement invalides.
    """
    if credentials is None or not credentials.credentials:
        raise CREDENTIALS_ERROR

    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        raise CREDENTIALS_ERROR

    object_id = to_object_id(user_id)
    if object_id is None:
        raise CREDENTIALS_ERROR

    user = await database.users.find_one({"_id": object_id})
    if user is None:
        raise CREDENTIALS_ERROR

    return user


CurrentUser = Annotated[dict[str, Any], Depends(get_current_user)]


async def require_admin(current_user: CurrentUser) -> dict[str, Any]:
    """N'autorise que les administrateurs, définis par e-mail dans la config.

    Renvoie 404 plutôt que 403 : à un non-administrateur, autant ne pas révéler
    que la route existe.
    """
    if not get_settings().is_admin_email(current_user.get("email")):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Introuvable.")
    return current_user


AdminUser = Annotated[dict[str, Any], Depends(require_admin)]
