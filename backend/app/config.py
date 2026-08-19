"""Configuration de l'application, lue depuis l'environnement."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_JWT_SECRET = "changez-moi-en-production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Base de données ---
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db: str = "fightconnect"

    # --- Environnement ---
    # « production » active les garde-fous : secret JWT par défaut refusé,
    # origines CORS explicites exigées.
    environment: str = "development"

    # --- Authentification ---
    # Doit impérativement être surchargée en production : la valeur par défaut
    # permet seulement de démarrer en local.
    jwt_secret: str = DEFAULT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 30  # 30 jours

    # --- Stripe ---
    stripe_secret_key: str = ""
    stripe_publishable_key: str = ""
    stripe_webhook_secret: str = ""
    currency: str = "eur"

    # --- Modération IA ---
    openai_api_key: str = ""
    openai_moderation_model: str = "omni-moderation-latest"

    # --- Application web ---
    # Dossier contenant l'export web du mobile. Servi par cette même API quand il
    # est présent : un seul déploiement suffit alors pour l'API et l'application.
    web_dir: str = "webapp"

    # --- Divers ---
    cors_origins: str = "*"
    commission_rate: float = 0.10

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"production", "prod"}

    @property
    def is_stripe_configured(self) -> bool:
        return self.stripe_secret_key.startswith("sk_")

    @property
    def is_openai_configured(self) -> bool:
        return bool(self.openai_api_key)

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def allows_any_origin(self) -> bool:
        return "*" in self.cors_origin_list

    def check_production_safety(self) -> None:
        """Refuse de démarrer en production avec une configuration dangereuse.

        Un secret JWT laissé à sa valeur par défaut permettrait à n'importe qui
        de forger un jeton valide : mieux vaut un démarrage qui échoue bruyamment
        qu'une API ouverte qui a l'air de fonctionner.
        """
        if not self.is_production:
            return
        if self.jwt_secret == DEFAULT_JWT_SECRET:
            raise RuntimeError(
                "JWT_SECRET est resté à sa valeur par défaut. "
                "Générez-en un : python -c \"import secrets; print(secrets.token_urlsafe(48))\""
            )


@lru_cache
def get_settings() -> Settings:
    """Instance unique : la configuration est relue une seule fois par process."""
    return Settings()
