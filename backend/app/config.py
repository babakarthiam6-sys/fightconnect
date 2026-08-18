"""Configuration de l'application, lue depuis l'environnement."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Base de données ---
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db: str = "fightconnect"

    # --- Authentification ---
    # Doit impérativement être surchargée en production : la valeur par défaut
    # permet seulement de démarrer en local.
    jwt_secret: str = "changez-moi-en-production"
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

    # --- Divers ---
    cors_origins: str = "*"
    commission_rate: float = 0.10

    @property
    def is_stripe_configured(self) -> bool:
        return self.stripe_secret_key.startswith("sk_")

    @property
    def is_openai_configured(self) -> bool:
        return bool(self.openai_api_key)

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """Instance unique : la configuration est relue une seule fois par process."""
    return Settings()
