"""Signaler, bloquer, modérer — ce que Google Play exige d'une app où l'on s'écrit."""

import pytest
from bson import ObjectId

from app.config import get_settings
from app.services import chat as chat_service
from tests.conftest import booking_payload, make_partner, register

ADMIN = "admin@exemple.com"


@pytest.fixture
def admin_emails(monkeypatch):
    """Déclare l'administrateur comme le ferait la variable ADMIN_EMAILS."""
    get_settings.cache_clear()
    monkeypatch.setenv("ADMIN_EMAILS", ADMIN)
    yield
    get_settings.cache_clear()


@pytest.fixture
def pushes(monkeypatch):
    envoyees = []

    async def faux_push(token, title, body, data=None):
        envoyees.append({"token": token, "title": title, "data": data})
        return True

    monkeypatch.setattr("app.routers.safety.send_push", faux_push)
    return envoyees


async def bloquer(client, qui, cible):
    return await client.post("/api/v1/blocks", json={"user_id": cible["user"]["id"]}, headers=qui["headers"])


async def ecrire(database, de, a, texte):
    expediteur = await database.users.find_one({"_id": ObjectId(de["user"]["id"])})
    return await chat_service.handle_message(database, expediteur, ObjectId(a["user"]["id"]), texte)


ANNONCE = {
    "kind": "sparring",
    "style": "boxing",
    "city": "Valence",
    "message": "Je cherche un partenaire pour 4 rounds techniques.",
}


# --- Blocages ---------------------------------------------------------------


async def test_bloquer_cache_les_deux_personnes_l_une_de_l_autre(client):
    luis = await make_partner(client)
    ana = await make_partner(client, "ana@exemple.com", "Ana")

    assert (await bloquer(client, ana, luis)).status_code == 201

    vue_ana = (await client.get("/api/v1/partners", headers=ana["headers"])).json()
    vue_luis = (await client.get("/api/v1/partners", headers=luis["headers"])).json()
    assert vue_ana["total"] == 0
    # Dans l'autre sens aussi : Luis ne doit pas pouvoir retrouver Ana.
    assert vue_luis["total"] == 0
    suggestions = (await client.get("/api/v1/moderation/recommendations", headers=luis["headers"])).json()
    assert suggestions["items"] == []


async def test_la_fiche_reste_visible_pour_celui_qui_bloque_pas_pour_le_bloque(client):
    luis = await make_partner(client)
    ana = await make_partner(client, "ana@exemple.com", "Ana")
    await bloquer(client, ana, luis)

    fiche = await client.get(f"/api/v1/partners/{luis['user']['id']}", headers=ana["headers"])
    assert fiche.status_code == 200
    assert fiche.json()["is_blocked"] is True

    inverse = await client.get(f"/api/v1/partners/{ana['user']['id']}", headers=luis["headers"])
    assert inverse.status_code == 404

    # Débloquer rétablit tout.
    assert (await client.delete(f"/api/v1/blocks/{luis['user']['id']}", headers=ana["headers"])).status_code == 204
    assert (await client.get(f"/api/v1/partners/{ana['user']['id']}", headers=luis["headers"])).status_code == 200
    assert (await client.get("/api/v1/partners", headers=luis["headers"])).json()["total"] == 1


async def test_la_liste_des_bloques_et_les_cas_limites(client, database):
    luis = await make_partner(client)
    ana = await register(client, "ana@exemple.com", "Ana")

    for _ in range(2):
        reponse = await bloquer(client, ana, luis)
        assert reponse.status_code == 201
    assert [p["first_name"] for p in reponse.json()["items"]] == ["Luis"]
    assert await database.blocks.count_documents({}) == 1

    liste = (await client.get("/api/v1/blocks", headers=ana["headers"])).json()
    assert [p["id"] for p in liste["items"]] == [luis["user"]["id"]]

    soi = await client.post("/api/v1/blocks", json={"user_id": ana["user"]["id"]}, headers=ana["headers"])
    assert soi.status_code == 409
    inconnu = await client.post("/api/v1/blocks", json={"user_id": str(ObjectId())}, headers=ana["headers"])
    assert inconnu.status_code == 404


async def test_un_blocage_empeche_de_s_ecrire_dans_les_deux_sens(client, database):
    luis = await make_partner(client)
    ana = await register(client, "ana@exemple.com", "Ana")
    await ecrire(database, ana, luis, "Salut, dispo samedi ?")
    await bloquer(client, ana, luis)

    depuis_ana = await ecrire(database, ana, luis, "Finalement non")
    depuis_luis = await ecrire(database, luis, ana, "Pourquoi ?")

    assert depuis_ana["type"] == "blocked"
    assert depuis_ana["reason"] == "user_blocked"
    # Luis n'apprend pas qu'il est bloqué.
    assert depuis_luis["type"] == "blocked"
    assert depuis_luis["reason"] == "unavailable"
    assert "bloqué" not in depuis_luis["message"]
    assert await database.messages.count_documents({}) == 1

    # Le fil disparaît de la liste de celle qui a bloqué.
    fils = (await client.get("/api/v1/chat/conversations", headers=ana["headers"])).json()
    assert fils["items"] == []


async def test_un_blocage_empeche_de_reserver(client):
    luis = await make_partner(client)
    ana = await make_partner(client, "ana@exemple.com", "Ana")
    await bloquer(client, ana, luis)

    par_ana = await client.post("/api/v1/bookings", json=booking_payload(luis["user"]["id"]), headers=ana["headers"])
    par_luis = await client.post("/api/v1/bookings", json=booking_payload(ana["user"]["id"]), headers=luis["headers"])

    assert par_ana.status_code == 409
    assert "bloqué" in par_ana.json()["detail"]
    assert par_luis.status_code == 409
    assert par_luis.json()["detail"] == "Ce partenaire n’est pas disponible en ce moment."


async def test_un_blocage_cache_les_annonces_et_ferme_les_reponses(client):
    luis = await make_partner(client)
    ana = await register(client, "ana@exemple.com", "Ana")
    maria = await register(client, "maria@exemple.com", "Maria")
    annonce_ana = (await client.post("/api/v1/announcements", json=ANNONCE, headers=ana["headers"])).json()
    annonce_luis = (await client.post("/api/v1/announcements", json=ANNONCE, headers=luis["headers"])).json()
    # Luis et Maria ont répondu avant le blocage.
    await client.post(f"/api/v1/announcements/{annonce_ana['id']}/replies", json={"message": "Moi !"}, headers=luis["headers"])
    await client.post(f"/api/v1/announcements/{annonce_ana['id']}/replies", json={"message": "Et moi"}, headers=maria["headers"])

    await bloquer(client, ana, luis)

    assert [a["id"] for a in (await client.get("/api/v1/announcements", headers=ana["headers"])).json()["items"]] == [annonce_ana["id"]]
    assert [a["id"] for a in (await client.get("/api/v1/announcements", headers=luis["headers"])).json()["items"]] == [annonce_luis["id"]]
    assert (await client.get(f"/api/v1/announcements/{annonce_ana['id']}", headers=luis["headers"])).status_code == 404
    refus = await client.post(f"/api/v1/announcements/{annonce_luis['id']}/replies", json={"message": "Moi"}, headers=ana["headers"])
    assert refus.status_code == 409

    # L'auteure ne voit plus la réponse de la personne bloquée, et le compte suit.
    detail = (await client.get(f"/api/v1/announcements/{annonce_ana['id']}", headers=ana["headers"])).json()
    assert [r["author"]["first_name"] for r in detail["replies"]] == ["Maria"]
    assert detail["replies_count"] == 1


# --- Signalements -----------------------------------------------------------


async def test_signaler_un_profil_garde_un_extrait_et_previent_l_admin(client, database, admin_emails, pushes):
    admin = await register(client, ADMIN, "Admin")
    await database.users.update_one({"_id": ObjectId(admin["user"]["id"])}, {"$set": {"expo_push_token": "ExponentPushToken[admin]"}})
    luis = await make_partner(client, bio="Profil de démonstration")
    ana = await register(client, "ana@exemple.com", "Ana")

    reponse = await client.post(
        "/api/v1/reports",
        json={"user_id": luis["user"]["id"], "reason": "fake_profile", "details": "  Palmarès inventé  "},
        headers=ana["headers"],
    )

    assert reponse.status_code == 201, reponse.text
    stocke = await database.reports.find_one({})
    assert stocke["target_type"] == "user"
    assert stocke["details"] == "Palmarès inventé"
    assert stocke["excerpt"] == "Luis Dupont — Profil de démonstration"
    assert [p["token"] for p in pushes] == ["ExponentPushToken[admin]"]

    # Le même signalement, renvoyé, n'en crée pas un second.
    encore = await client.post(
        "/api/v1/reports", json={"user_id": luis["user"]["id"], "reason": "fake_profile"}, headers=ana["headers"]
    )
    assert encore.json()["id"] == reponse.json()["id"]
    assert await database.reports.count_documents({}) == 1


async def test_on_ne_signale_que_ce_qu_on_a_pu_voir(client, database, pushes):
    luis = await make_partner(client)
    ana = await register(client, "ana@exemple.com", "Ana")
    maria = await register(client, "maria@exemple.com", "Maria")
    await ecrire(database, luis, ana, "Paie-moi en direct, c'est mieux")
    message = await database.messages.find_one({})

    recu = await client.post(
        "/api/v1/reports",
        json={"user_id": luis["user"]["id"], "target_type": "message", "target_id": str(message["_id"]), "reason": "fraud"},
        headers=ana["headers"],
    )
    assert recu.status_code == 201
    assert (await database.reports.find_one({"target_type": "message"}))["excerpt"] == "Paie-moi en direct, c'est mieux"

    # Maria n'a pas reçu ce message : elle ne peut pas le signaler.
    pas_recu = await client.post(
        "/api/v1/reports",
        json={"user_id": luis["user"]["id"], "target_type": "message", "target_id": str(message["_id"]), "reason": "fraud"},
        headers=maria["headers"],
    )
    assert pas_recu.status_code == 404

    # Une réponse à une annonce ne se signale que par l'auteur de l'annonce.
    annonce = (await client.post("/api/v1/announcements", json=ANNONCE, headers=ana["headers"])).json()
    await client.post(f"/api/v1/announcements/{annonce['id']}/replies", json={"message": "Moi !"}, headers=luis["headers"])
    reponse = await database.announcement_replies.find_one({})
    corps = {"user_id": luis["user"]["id"], "target_type": "announcement_reply", "target_id": str(reponse["_id"]), "reason": "harassment"}
    assert (await client.post("/api/v1/reports", json=corps, headers=maria["headers"])).status_code == 404
    assert (await client.post("/api/v1/reports", json=corps, headers=ana["headers"])).status_code == 201

    # Une annonce est publique : tout le monde peut la signaler.
    corps = {"user_id": ana["user"]["id"], "target_type": "announcement", "target_id": annonce["id"], "reason": "inappropriate"}
    assert (await client.post("/api/v1/reports", json=corps, headers=maria["headers"])).status_code == 201
    # … mais pas en l'attribuant à quelqu'un d'autre.
    corps["user_id"] = luis["user"]["id"]
    assert (await client.post("/api/v1/reports", json=corps, headers=maria["headers"])).status_code == 404


@pytest.mark.parametrize(
    ("champs", "statut"),
    [({"reason": "pas_beau"}, 422), ({"target_type": "avis"}, 422), ({"target_type": "message"}, 404)],
)
async def test_un_signalement_mal_forme_est_refuse(client, champs, statut):
    luis = await make_partner(client)
    ana = await register(client, "ana@exemple.com", "Ana")
    corps = {"user_id": luis["user"]["id"], "reason": "harassment", **champs}

    assert (await client.post("/api/v1/reports", json=corps, headers=ana["headers"])).status_code == statut
    soi = {"user_id": ana["user"]["id"], "reason": "harassment"}
    assert (await client.post("/api/v1/reports", json=soi, headers=ana["headers"])).status_code == 409


# --- Modération -------------------------------------------------------------


async def signalement(client, qui, cible, **champs):
    corps = {"user_id": cible["user"]["id"], "reason": "harassment", **champs}
    return (await client.post("/api/v1/reports", json=corps, headers=qui["headers"])).json()["id"]


async def test_seul_un_admin_voit_les_signalements(client, admin_emails, pushes):
    admin = await register(client, ADMIN, "Admin")
    luis = await make_partner(client)
    ana = await register(client, "ana@exemple.com", "Ana")
    await signalement(client, ana, luis)

    assert (await client.get("/api/v1/moderation/reports", headers=ana["headers"])).status_code == 404
    assert (await client.get("/api/v1/auth/me", headers=ana["headers"])).json()["is_admin"] is False
    assert (await client.get("/api/v1/auth/me", headers=admin["headers"])).json()["is_admin"] is True

    liste = (await client.get("/api/v1/moderation/reports", headers=admin["headers"])).json()
    [seul] = liste["items"]
    assert seul["reporter"]["first_name"] == "Ana"
    assert seul["reported"]["first_name"] == "Luis"
    assert seul["reported_open_reports"] == 1
    assert seul["status"] == "open"


async def test_classer_un_signalement(client, admin_emails, pushes):
    admin = await register(client, ADMIN, "Admin")
    luis = await make_partner(client)
    ana = await register(client, "ana@exemple.com", "Ana")
    report_id = await signalement(client, ana, luis)

    decision = await client.post(
        f"/api/v1/moderation/reports/{report_id}/resolve", json={"action": "dismiss"}, headers=admin["headers"]
    )

    assert decision.json()["status"] == "resolved"
    assert decision.json()["resolution"] == "dismiss"
    assert (await client.get("/api/v1/moderation/reports", headers=admin["headers"])).json()["items"] == []
    traites = (await client.get("/api/v1/moderation/reports", params={"status": "resolved"}, headers=admin["headers"])).json()
    assert [r["id"] for r in traites["items"]] == [report_id]
    # Classé, le profil reste en ligne.
    assert (await client.get("/api/v1/partners", headers=ana["headers"])).json()["total"] == 1


async def test_retirer_le_contenu_signale(client, database, admin_emails, pushes):
    admin = await register(client, ADMIN, "Admin")
    luis = await make_partner(client, bio="Présentation offensante")
    ana = await register(client, "ana@exemple.com", "Ana")
    await ecrire(database, luis, ana, "Message déplacé")
    message = await database.messages.find_one({})
    annonce = (await client.post("/api/v1/announcements", json=ANNONCE, headers=luis["headers"])).json()

    ids = [
        await signalement(client, ana, luis, target_type="message", target_id=str(message["_id"])),
        await signalement(client, ana, luis, target_type="announcement", target_id=annonce["id"]),
        await signalement(client, ana, luis),
    ]
    for report_id in ids:
        reponse = await client.post(
            f"/api/v1/moderation/reports/{report_id}/resolve", json={"action": "remove_content"}, headers=admin["headers"]
        )
        assert reponse.status_code == 200

    assert await database.messages.count_documents({}) == 0
    assert await database.announcements.count_documents({}) == 0
    profil = await database.users.find_one({"_id": ObjectId(luis["user"]["id"])})
    assert profil["bio"] is None
    # Le compte, lui, reste actif.
    assert (await client.get("/api/v1/auth/me", headers=luis["headers"])).status_code == 200


async def test_suspendre_un_compte(client, database, admin_emails, pushes):
    admin = await register(client, ADMIN, "Admin")
    luis = await make_partner(client)
    ana = await register(client, "ana@exemple.com", "Ana")
    maria = await register(client, "maria@exemple.com", "Maria")
    await client.post("/api/v1/announcements", json=ANNONCE, headers=luis["headers"])
    premier = await signalement(client, ana, luis)
    second = await signalement(client, maria, luis, reason="fraud")

    decision = await client.post(
        f"/api/v1/moderation/reports/{premier}/resolve", json={"action": "suspend"}, headers=admin["headers"]
    )
    assert decision.json()["reported_suspended"] is True

    # Plus de session, plus de connexion, plus de visibilité.
    assert (await client.get("/api/v1/auth/me", headers=luis["headers"])).status_code == 401
    connexion = await client.post("/api/v1/auth/login", json={"email": "luis@exemple.com", "password": "Sparring1"})
    assert connexion.status_code == 403
    assert "suspendu" in connexion.json()["detail"]
    assert (await client.get("/api/v1/partners", headers=ana["headers"])).json()["total"] == 0
    assert (await client.get(f"/api/v1/partners/{luis['user']['id']}", headers=ana["headers"])).status_code == 404
    assert (await client.get("/api/v1/announcements", headers=ana["headers"])).json()["total"] == 0
    assert (await ecrire(database, ana, luis, "Allô ?"))["type"] == "error"
    # L'autre signalement contre lui est réglé du même geste.
    autre = await database.reports.find_one({"_id": ObjectId(second)})
    assert autre["status"] == "resolved"

    # Une suspension par erreur se lève.
    leve = await client.post(f"/api/v1/moderation/users/{luis['user']['id']}/unsuspend", headers=admin["headers"])
    assert leve.status_code == 204
    connexion = await client.post("/api/v1/auth/login", json={"email": "luis@exemple.com", "password": "Sparring1"})
    assert connexion.status_code == 200


async def test_un_compte_suspendu_reste_cache_meme_marque_disponible(client, database):
    """Double sécurité : la suspension met le profil en pause, mais un compte
    suspendu par un script, ou par une version antérieure, doit rester caché
    même s'il est encore marqué disponible."""
    luis = await make_partner(client)
    ana = await register(client, "ana@exemple.com", "Ana")
    await database.users.update_one({"_id": ObjectId(luis["user"]["id"])}, {"$set": {"suspended": True}})

    assert (await client.get("/api/v1/partners", headers=ana["headers"])).json()["total"] == 0
    suggestions = (await client.get("/api/v1/moderation/recommendations", headers=ana["headers"])).json()
    assert suggestions["items"] == []
    reservation = await client.post("/api/v1/bookings", json=booking_payload(luis["user"]["id"]), headers=ana["headers"])
    assert reservation.status_code == 404


async def test_un_admin_ne_se_suspend_pas_depuis_l_application(client, admin_emails, pushes):
    admin = await register(client, ADMIN, "Admin")
    ana = await register(client, "ana@exemple.com", "Ana")
    report_id = await signalement(client, ana, admin)

    refus = await client.post(
        f"/api/v1/moderation/reports/{report_id}/resolve", json={"action": "suspend"}, headers=admin["headers"]
    )

    assert refus.status_code == 409


async def test_supprimer_son_compte_efface_blocages_et_signalements(client, database, pushes):
    luis = await make_partner(client)
    ana = await register(client, "ana@exemple.com", "Ana")
    maria = await register(client, "maria@exemple.com", "Maria")
    await bloquer(client, ana, luis)
    await bloquer(client, maria, ana)
    await signalement(client, ana, luis)
    await signalement(client, maria, ana)

    assert (await client.delete("/api/v1/auth/me", headers=ana["headers"])).status_code == 204

    assert await database.blocks.count_documents({}) == 0
    assert await database.reports.count_documents({}) == 0


# --- Conditions d'utilisation -----------------------------------------------


async def test_les_conditions_sont_publiques_et_acceptees_a_l_inscription(client, database):
    page = await client.get("/conditions")
    assert page.status_code == 200
    for passage in ("18 ans", "harcèlement", "hors de l’application", "Signaler et bloquer", "suspendre"):
        assert passage in page.text

    luis = await register(client)
    document = await database.users.find_one({"_id": ObjectId(luis["user"]["id"])})
    from app.routers.legal import TERMS_VERSION

    assert document["terms_version"] == TERMS_VERSION
