"""Fenêtre de surveillance : ce qu'elle laisse voir, et ce qu'elle refuse.

Une route d'administration est le genre d'ajout qui paraît anodin et qui devient
la faille. Ces tests portent donc autant sur ce qu'elle *ne fait pas* que sur ce
qu'elle fait.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import get_settings
from app.database import get_database
from app.main import create_app
from tests.conftest import booking_payload, make_partner, register

JETON = "jeton-de-surveillance-pour-les-tests"


@pytest.fixture
async def client_admin(database, monkeypatch):
    """Une application montée avec un jeton de surveillance configuré.

    Le client habituel n'en a pas : c'est justement ce qui permet de vérifier
    qu'aucune route d'administration n'existe sans jeton.
    """
    monkeypatch.setenv("ADMIN_TOKEN", JETON)
    get_settings.cache_clear()

    app = create_app()
    app.dependency_overrides[get_database] = lambda: database
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test", timeout=20
    ) as http:
        yield http

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_sans_jeton_configuré_la_route_n_existe_pas(client):
    """Le client ordinaire tourne sans `ADMIN_TOKEN`.

    On ne vérifie pas un code 404 : l'application web est montée après l'API et
    attrape tout chemin inconnu pour servir sa page d'accueil — c'est ce qui
    permet au routage du mobile de fonctionner en navigateur. L'absence de la
    route se lit donc à la nature de la réponse, pas à son code. Ce qui compte
    est qu'aucun compteur ne sorte, et qu'une 401 ne vienne pas annoncer
    « la porte existe, trouvez la clé ».
    """
    response = await client.get("/api/v1/admin/overview")

    assert response.status_code != 401
    assert "application/json" not in response.headers.get("content-type", "")
    assert "comptes" not in response.text


@pytest.mark.asyncio
async def test_un_jeton_absent_est_refusé(client_admin):
    response = await client_admin.get("/api/v1/admin/overview")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_un_jeton_faux_est_refusé(client_admin):
    response = await client_admin.get(
        "/api/v1/admin/overview", headers={"X-Admin-Token": "pas-le-bon"}
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_un_préfixe_correct_ne_suffit_pas(client_admin):
    """La comparaison est en temps constant, mais elle reste exacte."""
    response = await client_admin.get(
        "/api/v1/admin/overview", headers={"X-Admin-Token": JETON[:10]}
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_le_bon_jeton_donne_les_compteurs(client, client_admin, database):
    luis = await make_partner(client, country="FR")
    ana = await register(client, email="ana@exemple.com", first_name="Ana")
    await client.post(
        "/api/v1/bookings", json=booking_payload(luis["user"]["id"]), headers=ana["headers"]
    )

    response = await client_admin.get(
        "/api/v1/admin/overview", headers={"X-Admin-Token": JETON}
    )

    assert response.status_code == 200
    corps = response.json()
    assert corps["comptes"]["total"] == 2
    assert corps["comptes"]["profil_rempli"] == 1
    assert corps["comptes"]["visibles"] == 1
    assert corps["demandes"]["pending"] == 1
    assert corps["demandes"]["total"] == 1
    assert corps["pays"] == {"FR": 1}
    assert corps["disciplines"] == {"boxing": 1}


@pytest.mark.asyncio
async def test_aucune_donnée_personnelle_ne_sort(client, client_admin):
    """Le test qui compte.

    Surveiller la santé d'un service n'exige pas de lire le courrier de ses
    utilisateurs. Si quelqu'un ajoute un jour un champ « derniers inscrits » ou
    « derniers messages » à cette route, c'est ici que ça doit se voir.
    """
    luis = await make_partner(client, email="luis@exemple.com", first_name="Luis")
    ana = await register(client, email="ana@exemple.com", first_name="Ana")
    await client.post(
        "/api/v1/bookings", json=booking_payload(luis["user"]["id"]), headers=ana["headers"]
    )

    brut = (
        await client_admin.get("/api/v1/admin/overview", headers={"X-Admin-Token": JETON})
    ).text

    for interdit in (
        "luis@exemple.com",
        "ana@exemple.com",
        "Luis",
        "Ana",
        luis["user"]["id"],
        "password",
        "hash",
    ):
        assert interdit not in brut, f"« {interdit} » ne devrait pas sortir de la surveillance"


@pytest.mark.asyncio
async def test_la_surveillance_n_écrit_jamais(client_admin):
    """Aucun verbe d'écriture n'est exposé.

    Le jour où il faudra corriger une donnée, cela se fera à visage découvert et
    non par un canal conçu pour regarder.
    """
    for methode in ("post", "put", "patch", "delete"):
        appel = getattr(client_admin, methode)
        response = await appel(
            "/api/v1/admin/overview", headers={"X-Admin-Token": JETON}
        )
        assert response.status_code == 405, methode


@pytest.mark.asyncio
async def test_l_argent_ne_compte_que_les_séances_payées(client, client_admin, database):
    """Additionner des demandes en attente donnerait un chiffre d'affaires
    imaginaire, et c'est exactement le genre de chiffre qu'on finit par croire."""
    luis = await make_partner(client, price_per_round=20)
    ana = await register(client, email="ana@exemple.com", first_name="Ana")
    demande = await client.post(
        "/api/v1/bookings",
        json=booking_payload(luis["user"]["id"], rounds=2),
        headers=ana["headers"],
    )

    avant = await client_admin.get("/api/v1/admin/overview", headers={"X-Admin-Token": JETON})
    assert avant.json()["argent"] == {}

    from bson import ObjectId

    await database.bookings.update_one(
        {"_id": ObjectId(demande.json()["id"])}, {"$set": {"paid": True}}
    )

    apres = await client_admin.get("/api/v1/admin/overview", headers={"X-Admin-Token": JETON})
    assert apres.json()["argent"] == {
        "EUR": {"seances": 1, "volume": 40.0, "commission": 6.0}
    }
