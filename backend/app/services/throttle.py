"""Freinage des tentatives de connexion répétées.

Le compteur est stocké en base plutôt qu'en mémoire : plusieurs instances de
l'API partagent ainsi le même verrou, ce qu'un compteur en mémoire ne
permettrait pas. Le blocage porte sur l'email et non sur l'adresse IP, celle-ci
étant peu fiable derrière un proxy et partagée par des utilisateurs légitimes.
"""

from datetime import datetime, timedelta, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase

MAX_FAILURES = 8
LOCK_DURATION = timedelta(minutes=10)
# Au-delà de cette fenêtre sans échec, le compteur repart de zéro : un oubli
# ponctuel il y a trois heures ne doit pas compter.
FAILURE_WINDOW = timedelta(minutes=30)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


async def seconds_until_unlock(database: AsyncIOMotorDatabase, email: str) -> int:
    """Nombre de secondes restant avant déblocage, 0 si le compte est utilisable."""
    record = await database.login_attempts.find_one({"email": email})
    locked_until = _aware(record.get("locked_until")) if record else None
    if locked_until is None:
        return 0

    remaining = (locked_until - _now()).total_seconds()
    return max(0, int(remaining))


async def register_failure(database: AsyncIOMotorDatabase, email: str) -> None:
    now = _now()
    record = await database.login_attempts.find_one({"email": email})

    last_failure = _aware(record.get("last_failure_at")) if record else None
    within_window = last_failure is not None and now - last_failure <= FAILURE_WINDOW
    failures = (int(record.get("failures", 0)) if record and within_window else 0) + 1

    update: dict[str, object] = {"failures": failures, "last_failure_at": now}
    if failures >= MAX_FAILURES:
        update["locked_until"] = now + LOCK_DURATION
        update["failures"] = 0

    await database.login_attempts.update_one(
        {"email": email}, {"$set": update}, upsert=True
    )


async def clear(database: AsyncIOMotorDatabase, email: str) -> None:
    """Une connexion réussie efface l'ardoise."""
    await database.login_attempts.delete_one({"email": email})
