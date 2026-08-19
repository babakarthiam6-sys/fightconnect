"""Point d'entrée de l'API FightConnect."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import connect, disconnect, ping
from app.routers import auth, moderation, payments, revenue, sparrings
from app.webapp import is_web_app_available, mount_web_app

API_PREFIX = "/api/v1"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect()
    yield
    await disconnect()


def create_app() -> FastAPI:
    settings = get_settings()
    settings.check_production_safety()

    app = FastAPI(
        title="FightConnect API",
        version="1.0.0",
        description="Mise en relation de partenaires de sparring : comptes, séances, paiements et modération.",
        lifespan=lifespan,
    )

    # Un navigateur rejette la combinaison « origine * » + credentials : le
    # middleware renverrait alors des en-têtes que le client refuse. L'app mobile
    # n'utilise pas de cookies, seulement un en-tête Authorization, donc couper
    # les credentials avec le joker est sans effet sur elle.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=not settings.allows_any_origin,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    for router in (auth.router, sparrings.router, payments.router, revenue.router, moderation.router):
        app.include_router(router, prefix=API_PREFIX)

    web_disponible = is_web_app_available(settings.web_dir)

    @app.get("/health", tags=["système"])
    async def health() -> dict[str, object]:
        """Sonde de disponibilité, utilisée par l'hébergeur et pour diagnostiquer."""
        database_ready = await ping()
        return {
            "status": "ok" if database_ready else "degraded",
            "database": database_ready,
            "stripe_configured": settings.is_stripe_configured,
            "moderation_configured": settings.is_openai_configured,
            "web_app": web_disponible,
        }

    # En dernier, impérativement : un montage sur « / » placé plus haut
    # intercepterait /api, /health et /docs.
    if web_disponible:
        mount_web_app(app, settings.web_dir)

    return app


app = create_app()
