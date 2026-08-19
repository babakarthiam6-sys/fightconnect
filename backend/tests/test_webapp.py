"""L'application web servie par l'API ne doit masquer aucune route de l'API."""

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
    """Le routage se fait dans le navigateur : /sparring/abc doit rendre la page."""
    response = await client_avec_web.get("/sparring/abc")

    assert response.status_code == 200
    assert "application" in response.text


async def test_l_api_reste_prioritaire_sur_le_montage(client_avec_web):
    """Le piège : un montage placé trop tôt masquerait toute l'API."""
    sante = await client_avec_web.get("/health")
    assert sante.status_code == 200
    assert sante.json()["web_app"] is True

    sparrings = await client_avec_web.get("/api/v1/sparrings")
    assert sparrings.status_code == 200
    assert "items" in sparrings.json()

    # Une route protégée doit toujours répondre 401, et non l'application web.
    assert (await client_avec_web.get("/api/v1/auth/me")).status_code == 401


async def test_la_documentation_reste_accessible(client_avec_web):
    assert (await client_avec_web.get("/docs")).status_code == 200
