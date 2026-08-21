"""Configuration de l'application, lue depuis l'environnement."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_JWT_SECRET = "changez-moi-en-production"
DEFAULT_MONGODB_URI = "mongodb://localhost:27017"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Base de données ---
    mongodb_uri: str = DEFAULT_MONGODB_URI
    mongodb_db: str = "fightconnect"

    # Railway injecte `MONGO_URL` dès que sa base MongoDB est ajoutée au projet.
    # L'accepter évite d'avoir à ouvrir un compte MongoDB Atlas séparé : la base
    # vit dans le même projet que l'API et sa chaîne de connexion est renseignée
    # toute seule.
    mongo_url: str = ""

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

    # --- Adresse publique ---
    # Utilisée comme point de retour après l'inscription Stripe. Vide, l'adresse
    # est déduite de la requête, ce qui suffit dans la plupart des cas.
    public_base_url: str = ""

    # --- Application web ---
    # Dossier contenant l'export web du mobile. Servi par cette même API quand il
    # est présent : un seul déploiement suffit alors pour l'API et l'application.
    web_dir: str = "webapp"

    # --- Divers ---
    cors_origins: str = "*"
    # Part de la plateforme, prélevée sur le versement au partenaire. Elle ne
    # s'ajoute pas au total : celui qui réserve paie le tarif annoncé.
    # `frontend/constants/config.ts` reprend cette valeur pour afficher le
    # décompte avant la création de la demande ; un test de cohérence échoue si
    # les deux divergent.
    commission_rate: float = 0.15

    @property
    def database_uri(self) -> str:
        """Chaîne de connexion effective.

        `MONGODB_URI` l'emporte quand elle est renseignée explicitement ; sinon on
        se rabat sur le `MONGO_URL` de l'hébergeur, puis sur le serveur local.
        """
        if self.mongodb_uri != DEFAULT_MONGODB_URI:
            return self.mongodb_uri
        return self.mongo_url or self.mongodb_uri

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
