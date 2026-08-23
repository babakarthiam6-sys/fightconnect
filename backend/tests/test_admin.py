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


JETON_ACTION = "jeton-d-action-pour-les-tests"


@pytest.fixture
async def client_actions(database, monkeypatch):
    """Application montée avec les deux jetons : lecture et action."""
    monkeypatch.setenv("ADMIN_TOKEN", JETON)
    monkeypatch.setenv("ADMIN_WRITE_TOKEN", JETON_ACTION)
    get_settings.cache_clear()

    app = create_app()
    app.dependency_overrides[get_database] = lambda: database
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test", timeout=20
    ) as http:
        yield http

    get_settings.cache_clear()


DEUX = {"X-Admin-Token": JETON, "X-Admin-Write-Token": JETON_ACTION}


@pytest.mark.asyncio
async def test_le_jeton_de_lecture_ne_donne_pas_le_droit_d_agir(client_actions, client):
    """Le test central de cette séparation.

    Le jeton de lecture vit dans la configuration d'un assistant, sur une
    machine de bureau, dans un fichier de notes. S'il suffisait à suspendre un
    compte, la séparation ne servirait à rien.
    """
    luis = await make_partner(client)

    response = await client_actions.post(
        f"/api/v1/admin/users/{luis['user']['id']}/suspend",
        headers={"X-Admin-Token": JETON},
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_sans_jeton_d_action_configure_les_routes_n_existent_pas(
    client_admin, client, database
):
    """`client_admin` n'a que `ADMIN_TOKEN` : les actions ne sont pas montées.

    On ne vérifie pas un code précis — un POST sur un chemin non monté ressort
    en 405 par le routeur, ou en page d'accueil par l'application web, selon ce
    qui attrape le chemin en premier. Ce qui compte est qu'il ne se soit rien
    passé en base, même en présentant les deux jetons.
    """
    luis = await make_partner(client)

    response = await client_admin.post(
        f"/api/v1/admin/users/{luis['user']['id']}/suspend",
        headers={"X-Admin-Token": JETON, "X-Admin-Write-Token": JETON_ACTION},
    )

    assert response.status_code != 200
    utilisateur = await database.users.find_one({"email": "luis@exemple.com"})
    assert utilisateur.get("suspended") is not True
    assert await database.admin_log.count_documents({}) == 0


@pytest.mark.asyncio
async def test_suspendre_retire_de_la_recherche(client_actions, client, database):
    luis = await make_partner(client)
    ana = await register(client, email="ana@exemple.com", first_name="Ana")

    avant = await client.get("/api/v1/partners", headers=ana["headers"])
    assert avant.json()["total"] == 1

    response = await client_actions.post(
        f"/api/v1/admin/users/{luis['user']['id']}/suspend", headers=DEUX
    )

    assert response.status_code == 200
    apres = await client.get("/api/v1/partners", headers=ana["headers"])
    assert apres.json()["total"] == 0


@pytest.mark.asyncio
async def test_un_compte_suspendu_peut_encore_se_connecter(client_actions, client):
    """Le RGPD ne permet pas de retirer à quelqu'un l'accès à ses propres
    données : un compte suspendu doit pouvoir contester et se supprimer."""
    luis = await make_partner(client)
    await client_actions.post(
        f"/api/v1/admin/users/{luis['user']['id']}/suspend", headers=DEUX
    )

    profil = await client.get("/api/v1/auth/me", headers=luis["headers"])

    assert profil.status_code == 200


@pytest.mark.asyncio
async def test_lever_la_suspension_ne_remet_pas_en_ligne(client_actions, client, database):
    """Décider à sa place qu'il souhaite reprendre serait présumer de son
    intention."""
    luis = await make_partner(client)
    await client_actions.post(
        f"/api/v1/admin/users/{luis['user']['id']}/suspend", headers=DEUX
    )
    await client_actions.post(
        f"/api/v1/admin/users/{luis['user']['id']}/unsuspend", headers=DEUX
    )

    utilisateur = await database.users.find_one({"email": "luis@exemple.com"})
    assert utilisateur["suspended"] is False
    assert utilisateur["available"] is False


@pytest.mark.asyncio
async def test_chaque_action_laisse_une_trace(client_actions, client):
    """Une action d'administration sans trace est une action que personne ne
    peut contester trois mois plus tard."""
    luis = await make_partner(client)
    await client_actions.post(
        f"/api/v1/admin/users/{luis['user']['id']}/suspend", headers=DEUX
    )

    journal = await client_actions.get(
        "/api/v1/admin/journal", headers={"X-Admin-Token": JETON}
    )

    lignes = journal.json()["items"]
    assert len(lignes) == 1
    assert lignes[0]["action"] == "suspend"
    assert lignes[0]["cible"] == luis["user"]["id"]


@pytest.mark.asyncio
async def test_la_file_des_signalements_ne_montre_aucun_contenu(client_actions, client):
    """Traiter un signalement, c'est agir sur une cible désignée, pas lire la
    conversation d'autrui."""
    luis = await make_partner(client)
    ana = await register(client, email="ana@exemple.com", first_name="Ana")
    await client.post(
        "/api/v1/securite/reports",
        json={
            "target_type": "user",
            "target_id": luis["user"]["id"],
            "reason": "harcelement",
            "details": "Il m'a envoyé des insultes répétées le 12 août",
        },
        headers=ana["headers"],
    )

    file = await client_actions.get(
        "/api/v1/admin/reports", headers={"X-Admin-Token": JETON}
    )

    brut = file.text
    assert file.json()["ouverts"] == 1
    assert "insultes répétées" not in brut
    assert "ana@exemple.com" not in brut
