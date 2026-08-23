"""L'application web servie par l'API ne doit masquer aucune route de l'API."""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.database import get_database
from app.main import create_app


@pytest_asyncio.fixture
async def client_avec_web(database, tmp_path, monkeypatch):
    """Une API démarrée avec un export web factice monté à la racine."""
    (tmp_path / "index.html").write_text("<html>application</html>", encoding="utf-8")
    (tmp_path / "_expo").mkdir()
    (tmp_path / "_expo" / "bundle.js").write_text("// bundle", encoding="utf-8")

    from app.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("WEB_DIR", str(tmp_path))

    app = create_app()
    app.dependency_overrides[get_database] = lambda: database

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
        yield http

    get_settings.cache_clear()


async def test_la_racine_sert_l_application(client_avec_web):
    response = await client_avec_web.get("/")

    assert response.status_code == 200
    assert "application" in response.text


async def test_les_fichiers_du_bundle_sont_servis(client_avec_web):
    assert (await client_avec_web.get("/_expo/bundle.js")).status_code == 200


async def test_un_chemin_inconnu_retombe_sur_l_application(client_avec_web):
    """Le routage se fait dans le navigateur : /partner/abc doit rendre la page."""
    response = await client_avec_web.get("/partner/abc")

    assert response.status_code == 200
    assert "application" in response.text


async def test_l_api_reste_prioritaire_sur_le_montage(client_avec_web):
    """Le piège : un montage placé trop tôt masquerait toute l'API."""
    sante = await client_avec_web.get("/health")
    assert sante.status_code == 200
    assert sante.json()["web_app"] is True

    # Une route d'API protégée doit répondre 401, et non servir l'application
    # web : c'est le signe que le montage n'a pas avalé /api.
    assert (await client_avec_web.get("/api/v1/partners")).status_code == 401
    assert (await client_avec_web.get("/api/v1/auth/me")).status_code == 401


async def test_la_documentation_reste_accessible(client_avec_web):
    assert (await client_avec_web.get("/docs")).status_code == 200


@pytest.mark.asyncio
async def test_les_pages_legales_repondent_sans_authentification(client):
    """Google exige que la page de suppression soit atteignable sans installer
    l'application : quelqu'un qui a désinstallé doit pouvoir effacer ses
    données. Une page derrière un jeton ne vaudrait rien."""
    for chemin in ("/confidentialite", "/suppression"):
        response = await client.get(chemin)

        assert response.status_code == 200, chemin
        assert "text/html" in response.headers["content-type"]
        assert "FightConnect" in response.text


@pytest.mark.asyncio
async def test_la_page_de_confidentialite_dit_l_essentiel(client):
    """Les deux magasins lisent cette page. Trois affirmations doivent y être :
    ce qu'on ne voit pas, comment effacer, et qui d'autre a accès."""
    texte = (await client.get("/confidentialite")).text

    assert "Stripe" in texte
    assert "Supprimer mon compte" in texte
    assert "ne vendons aucune donnée" in texte
