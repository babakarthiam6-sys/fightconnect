"""Point d'entrée de l'API FightConnect."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import connect, disconnect, ping
from app.routers import auth, moderation, payments, revenue, sparrings

API_PREFIX = "/api/v1"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect()
    yield
    await disconnect()


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="FightConnect API",
        version="1.0.0",
        description="Mise en relation de partenaires de sparring : comptes, séances, paiements et modération.",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    for router in (auth.router, sparrings.router, payments.router, revenue.router, moderation.router):
        app.include_router(router, prefix=API_PREFIX)

    @app.get("/health", tags=["système"])
    async def health() -> dict[str, object]:
        """Sonde de disponibilité, utilisée par l'hébergeur et pour diagnostiquer."""
        database_ready = await ping()
        return {
            "status": "ok" if database_ready else "degraded",
            "database": database_ready,
            "stripe_configured": settings.is_stripe_configured,
            "moderation_configured": settings.is_openai_configured,
        }

    return app


app = create_app()
