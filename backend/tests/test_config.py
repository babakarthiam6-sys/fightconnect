import pytest

from app.config import DEFAULT_JWT_SECRET, Settings


def make_settings(**overrides) -> Settings:
    # `_env_file=None` : les tests ne doivent pas dépendre d'un .env local.
    return Settings(_env_file=None, **overrides)


def test_le_secret_par_defaut_est_refuse_en_production():
    settings = make_settings(environment="production", jwt_secret=DEFAULT_JWT_SECRET)

    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        settings.check_production_safety()


def test_un_vrai_secret_passe_en_production():
    settings = make_settings(environment="production", jwt_secret="un-secret-vraiment-aleatoire")
    settings.check_production_safety()  # ne lève pas


def test_le_secret_par_defaut_reste_tolere_en_developpement():
    make_settings(environment="development").check_production_safety()  # ne lève pas


def test_les_origines_sont_decoupees():
    settings = make_settings(cors_origins="https://a.fr, https://b.fr")

    assert settings.cors_origin_list == ["https://a.fr", "https://b.fr"]
    assert settings.allows_any_origin is False


def test_le_joker_est_detecte():
    assert make_settings(cors_origins="*").allows_any_origin is True


def test_stripe_est_considere_absent_sans_cle_valide():
    assert make_settings(stripe_secret_key="").is_stripe_configured is False
    assert make_settings(stripe_secret_key="pas-une-cle").is_stripe_configured is False
    assert make_settings(stripe_secret_key="sk_test_123").is_stripe_configured is True


def test_l_application_web_est_facultative(tmp_path):
    """L'API doit démarrer sans export web : c'est le cas en développement."""
    from app.webapp import is_web_app_available

    assert is_web_app_available(str(tmp_path)) is False

    (tmp_path / "index.html").write_text("<html></html>", encoding="utf-8")
    assert is_web_app_available(str(tmp_path)) is True


def test_la_base_de_l_hebergeur_evite_un_compte_separe():
    """Railway injecte MONGO_URL : l'accepter supprime le besoin d'Atlas."""
    settings = make_settings(mongo_url="mongodb://interne:27017/app")

    assert settings.database_uri == "mongodb://interne:27017/app"


def test_une_uri_explicite_l_emporte_sur_celle_de_l_hebergeur():
    settings = make_settings(
        mongodb_uri="mongodb+srv://atlas.exemple.net",
        mongo_url="mongodb://interne:27017/app",
    )

    assert settings.database_uri == "mongodb+srv://atlas.exemple.net"


def test_sans_rien_on_vise_le_serveur_local():
    assert make_settings().database_uri == "mongodb://localhost:27017"
