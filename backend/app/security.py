"""Hachage des mots de passe et jetons JWT."""

from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext

from app.config import get_settings

_password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    # bcrypt tronque au-delà de 72 octets : on coupe explicitement pour éviter
    # une exception sur les mots de passe très longs.
    return _password_context.hash(password[:72])


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _password_context.verify(plain[:72], hashed)
    except ValueError:
        # Empreinte illisible en base : on refuse sans faire tomber la requête.
        return False


def create_access_token(user_id: str) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> str | None:
    """Renvoie l'identifiant de l'utilisateur, ou None si le jeton est invalide."""
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        return None

    subject = payload.get("sub")
    return subject if isinstance(subject, str) else None
