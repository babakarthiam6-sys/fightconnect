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
