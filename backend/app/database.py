"""Connexion MongoDB et accès aux collections."""

import logging

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.config import get_settings

logger = logging.getLogger(__name__)

_client: AsyncIOMotorClient | None = None
_database: AsyncIOMotorDatabase | None = None


async def connect() -> AsyncIOMotorDatabase:
    """Ouvre la connexion et crée les index. Appelée au démarrage de l'app."""
    global _client, _database

    settings = get_settings()
    # Délai court : une base injoignable doit produire une erreur nette plutôt
    # qu'une requête qui pend pendant 30 secondes.
    _client = AsyncIOMotorClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000)
    _database = _client[settings.mongodb_db]

    try:
        await create_indexes(_database)
    except Exception as error:  # pragma: no cover - dépend de l'infrastructure
        # L'API démarre quand même : sur un hébergeur, la base peut n'être
        # disponible que quelques secondes après le service web, et un crash au
        # démarrage transformerait ce délai en boucle de redémarrage.
        logger.warning("Index non créés, base indisponible au démarrage : %s", error)

    return _database


async def disconnect() -> None:
    global _client, _database
    if _client is not None:
        _client.close()
    _client = None
    _database = None


async def create_indexes(database: AsyncIOMotorDatabase) -> None:
    """Index nécessaires aux requêtes chaudes et à l'unicité de l'email."""
    await database.users.create_index("email", unique=True)
    await database.sparrings.create_index([("scheduled_at", 1)])
    await database.sparrings.create_index([("creator_id", 1)])
    await database.reviews.create_index([("sparring_id", 1)])
    await database.reviews.create_index([("author_id", 1)])
    await database.payments.create_index([("user_id", 1), ("created_at", -1)])
    # Le webhook Stripe retrouve un paiement par son identifiant d'intention.
    await database.payments.create_index("payment_intent_id")


async def ping() -> bool:
    """Teste la disponibilité réelle de la base, pour la sonde /health."""
    if _database is None:
        return False
    try:
        await _database.command("ping")
        return True
    except Exception:
        return False


def get_database() -> AsyncIOMotorDatabase:
    """Dépendance FastAPI. Surchargée par les tests avec une base en mémoire."""
    if _database is None:
        raise RuntimeError("La base de données n'est pas connectée.")
    return _database
