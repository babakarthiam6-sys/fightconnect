"""Point d'entrée de l'API FightConnect."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from app.config import get_settings
from app.database import connect, disconnect, ping
from app.legal import CONFIDENTIALITE_FR, SUPPRESSION_FR
from app.i18n import choisir_langue, definir_langue
from app.routers import (
    admin,
    auth,
    bookings,
    chat,
    moderation,
    partners,
    payments,
    payouts,
    revenue,
    securite,
)
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
        description="Mise en relation de partenaires de sparring : profils, réservations, paiements et modération.",
        lifespan=lifespan,
    )

    # Un navigateur rejette la combinaison « origine * » + credentials : le
    # middleware renverrait alors des en-têtes que le client refuse. L'app mobile
    # n'utilise pas de cookies, seulement un en-tête Authorization, donc couper
    # les credentials avec le joker est sans effet sur elle.
    @app.middleware("http")
    async def langue_de_la_requete(request: Request, call_next):
        """Fixe la langue des messages pour toute la durée de la requête.

        Posée ici plutôt qu'au fond des routeurs : un message d'erreur peut
        naître dans un service, loin du point d'entrée, et n'a alors plus accès
        à l'en-tête.
        """
        definir_langue(choisir_langue(request.headers.get("accept-language")))
        return await call_next(request)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=not settings.allows_any_origin,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    for router in (
        auth.router,
        partners.router,
        bookings.router,
        chat.router,
        payments.router,
        payouts.router,
        revenue.router,
        moderation.router,
        securite.router,
    ):
        app.include_router(router, prefix=API_PREFIX)

    # La fenêtre de surveillance n'existe que si un jeton est configuré. Monter
    # les routes puis vérifier le jeton à l'intérieur reviendrait au même en
    # théorie ; en pratique, une porte absente ne s'ouvre pas par oubli.
    if settings.admin_token:
        app.include_router(admin.router, prefix=API_PREFIX)
        # Les actions n'apparaissent qu'avec leur propre jeton : lire ne donne
        # jamais le droit d'écrire, même par erreur de configuration.
        if settings.admin_write_token:
            app.include_router(admin.actions, prefix=API_PREFIX)

    web_disponible = is_web_app_available(settings.web_dir)

    # Ces deux pages sont déclarées aux magasins d'applications. Les servir ici
    # plutôt que sur un site à part évite le piège classique : une adresse
    # hébergée ailleurs qui expire, et fait retirer l'application des mois plus
    # tard sans que personne ne comprenne pourquoi.
    @app.get("/confidentialite", response_class=HTMLResponse, tags=["légal"])
    async def confidentialite() -> str:
        return CONFIDENTIALITE_FR

    @app.get("/suppression", response_class=HTMLResponse, tags=["légal"])
    async def suppression() -> str:
        return SUPPRESSION_FR

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
