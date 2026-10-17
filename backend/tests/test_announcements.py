"""Annonces : publication, liste, réponses, clôture, et départ avec le compte."""

from datetime import datetime, timedelta, timezone

import pytest
from bson import ObjectId

from app.schemas import MAX_OPEN_ANNOUNCEMENTS
from tests.conftest import make_partner, register

BASE = "/api/v1/announcements"


def annonce(**overrides):
    payload = {
        "kind": "sparring",
        "style": "boxing",
        "city": "Valence",
        "level": "amateur",
        "weight_class": "middleweight",
        "message": "Je cherche un partenaire pour 4 rounds techniques le jeudi soir.",
    }
    payload.update(overrides)
    return payload


def dans(jours: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=jours)).isoformat()


@pytest.fixture
def pushes(monkeypatch):
    """Notifications envoyées, sans appeler le service d'Expo."""
    envoyees = []

    async def faux_push(token, title, body, data=None):
        envoyees.append({"token": token, "title": title, "body": body, "data": data})
        return True

    monkeypatch.setattr("app.routers.announcements.send_push", faux_push)
    return envoyees


async def test_publier_une_annonce(client):
    karim = await register(client, "karim@exemple.com", "Karim")

    reponse = await client.post(BASE, json=annonce(), headers=karim["headers"])

    assert reponse.status_code == 201, reponse.text
    corps = reponse.json()
    assert corps["kind"] == "sparring"
    assert corps["style"] == "boxing"
    assert corps["status"] == "open"
    assert corps["is_mine"] is True
    assert corps["author"]["first_name"] == "Karim"
    # L'auteur voit la liste de ses réponses, vide pour l'instant.
    assert corps["replies"] == []
    assert corps["replies_count"] == 0
    # Sans date, l'annonce vit un mois.
    expire = datetime.fromisoformat(corps["expires_at"])
    assert timedelta(days=29) < expire - datetime.now(timezone.utc) <= timedelta(days=30)


async def test_une_annonce_datee_vit_jusqu_a_sa_date(client):
    karim = await register(client, "karim@exemple.com", "Karim")
    date = dans(10)

    corps = (await client.post(BASE, json=annonce(scheduled_for=date), headers=karim["headers"])).json()

    assert datetime.fromisoformat(corps["expires_at"]) == datetime.fromisoformat(date)
    assert datetime.fromisoformat(corps["scheduled_for"]) == datetime.fromisoformat(date)


@pytest.mark.parametrize(
    ("champs", "attendu"),
    [
        ({"kind": "bagarre"}, "Type d’annonce inconnu"),
        ({"style": "sumo"}, "Sport inconnu"),
        ({"level": "legende"}, "Niveau inconnu"),
        ({"weight_class": "ultra"}, "Catégorie de poids inconnu"),
        ({"scheduled_for": "2020-01-01T10:00:00+00:00"}, "dans le futur"),
        ({"scheduled_for": dans(400)}, "moins d’un an"),
        ({"scheduled_for": "demain soir"}, "Date invalide"),
        ({"video_url": "https://exemple.com/video"}, "Lien vidéo non reconnu"),
        ({"message": "          Salut    "}, "10 caractères"),
    ],
)
async def test_une_annonce_mal_remplie_est_refusee(client, champs, attendu):
    karim = await register(client, "karim@exemple.com", "Karim")

    reponse = await client.post(BASE, json=annonce(**champs), headers=karim["headers"])

    assert reponse.status_code == 422
    assert attendu in reponse.text


async def test_les_infos_du_combattant_ne_valent_que_pour_un_combat(client):
    coach = await register(client, "coach@exemple.com", "Samir")
    combattant = {
        "fighter_name": "Yanis K.",
        "fighter_record": "8-2-0",
        "weight_kg": 70,
        "video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    }

    combat = (
        await client.post(
            BASE,
            json=annonce(kind="fight", message="Adversaire cherché pour un gala amateur à Valence.", **combattant),
            headers=coach["headers"],
        )
    ).json()
    sparring = (
        await client.post(BASE, json=annonce(**combattant), headers=coach["headers"])
    ).json()

    assert combat["fighter_name"] == "Yanis K."
    assert combat["fighter_record"] == "8-2-0"
    assert combat["weight_kg"] == 70
    assert combat["video_provider"] == "youtube"
    # Pour un sparring, ces champs n'ont pas de sens : ils sont ignorés.
    assert sparring["fighter_name"] is None
    assert sparring["fighter_record"] is None
    assert sparring["weight_kg"] is None
    # Le lien vidéo, lui, sert aussi à montrer son propre niveau.
    assert sparring["video_provider"] == "youtube"


async def test_une_annonce_qui_contourne_la_plateforme_n_est_pas_publiee(client, database):
    karim = await register(client, "karim@exemple.com", "Karim")

    reponse = await client.post(
        BASE,
        json=annonce(message="Sparring payé en liquide, écris-moi au 06 12 34 56 78."),
        headers=karim["headers"],
    )

    assert reponse.status_code == 422
    assert "passent par l’application" in reponse.text
    assert await database.announcements.count_documents({}) == 0


async def test_le_nom_du_combattant_est_modere_aussi(client):
    coach = await register(client, "coach@exemple.com", "Samir")

    reponse = await client.post(
        BASE,
        json=annonce(kind="fight", fighter_name="Contact WhatsApp 0612345678"),
        headers=coach["headers"],
    )

    assert reponse.status_code == 422


async def test_le_nombre_d_annonces_en_ligne_est_limite(client):
    karim = await register(client, "karim@exemple.com", "Karim")
    publiees = []
    for _ in range(MAX_OPEN_ANNOUNCEMENTS):
        reponse = await client.post(BASE, json=annonce(), headers=karim["headers"])
        assert reponse.status_code == 201
        publiees.append(reponse.json()["id"])

    refusee = await client.post(BASE, json=annonce(), headers=karim["headers"])
    assert refusee.status_code == 409

    # Clôturer une annonce libère une place.
    await client.post(f"{BASE}/{publiees[0]}/close", headers=karim["headers"])
    assert (await client.post(BASE, json=annonce(), headers=karim["headers"])).status_code == 201


async def test_la_liste_filtre_et_ne_montre_que_les_annonces_en_ligne(client, database):
    karim = await register(client, "karim@exemple.com", "Karim")
    ana = await register(client, "ana@exemple.com", "Ana")

    await client.post(BASE, json=annonce(city="Valence"), headers=karim["headers"])
    await client.post(
        BASE,
        json=annonce(kind="fight", style="muay_thai", city="Madrid", message="Adversaire pour un gala de muay-thaï."),
        headers=karim["headers"],
    )
    close = (await client.post(BASE, json=annonce(), headers=ana["headers"])).json()
    await client.post(f"{BASE}/{close['id']}/close", headers=ana["headers"])
    expiree = (await client.post(BASE, json=annonce(), headers=ana["headers"])).json()
    await database.announcements.update_one(
        {"_id": ObjectId(expiree["id"])},
        {"$set": {"expires_at": datetime.now(timezone.utc) - timedelta(minutes=1)}},
    )

    tout = (await client.get(BASE, headers=ana["headers"])).json()
    assert tout["total"] == 2
    assert {item["city"] for item in tout["items"]} == {"Valence", "Madrid"}
    assert all(item["is_mine"] is False for item in tout["items"])
    # Les réponses d'une annonce ne sont pas exposées dans la liste.
    assert all(item["replies"] is None for item in tout["items"])

    combats = (await client.get(BASE, params={"kind": "fight"}, headers=ana["headers"])).json()
    assert [item["style"] for item in combats["items"]] == ["muay_thai"]

    par_ville = (await client.get(BASE, params={"city": "val"}, headers=ana["headers"])).json()
    assert [item["city"] for item in par_ville["items"]] == ["Valence"]

    inconnu = await client.get(BASE, params={"style": "sumo"}, headers=ana["headers"])
    assert inconnu.status_code == 422

    # Ses propres annonces figurent dans la liste, marquées comme telles.
    vues_par_karim = (await client.get(BASE, headers=karim["headers"])).json()
    assert all(item["is_mine"] for item in vues_par_karim["items"])


async def test_repondre_previent_l_auteur_qui_voit_les_reponses(client, database, pushes):
    karim = await register(client, "karim@exemple.com", "Karim")
    await database.users.update_one(
        {"_id": ObjectId(karim["user"]["id"])},
        {"$set": {"expo_push_token": "ExponentPushToken[karim]"}},
    )
    luis = await make_partner(client)
    publiee = (await client.post(BASE, json=annonce(), headers=karim["headers"])).json()

    reponse = await client.post(
        f"{BASE}/{publiee['id']}/replies",
        json={"message": "Dispo jeudi à 19h, je fais 75 kg."},
        headers=luis["headers"],
    )

    assert reponse.status_code == 200, reponse.text
    vue_par_luis = reponse.json()
    assert vue_par_luis["has_replied"] is True
    assert vue_par_luis["replies_count"] == 1
    # Celui qui répond ne voit pas les réponses des autres.
    assert vue_par_luis["replies"] is None

    assert pushes == [
        {
            "token": "ExponentPushToken[karim]",
            "title": "Nouvelle réponse à votre annonce",
            "body": "Luis : Dispo jeudi à 19h, je fais 75 kg.",
            "data": {"type": "announcement_reply", "announcement_id": publiee["id"]},
        }
    ]

    vue_par_karim = (await client.get(f"{BASE}/{publiee['id']}", headers=karim["headers"])).json()
    assert vue_par_karim["replies_count"] == 1
    [seule] = vue_par_karim["replies"]
    assert seule["message"] == "Dispo jeudi à 19h, je fais 75 kg."
    assert seule["author"]["first_name"] == "Luis"
    # Le tarif du partenaire suit la réponse : c'est lui qui le fixe.
    assert seule["author"]["price_per_round"] == 20


async def test_un_double_appui_ne_compte_qu_une_reponse(client, database, pushes):
    karim = await register(client, "karim@exemple.com", "Karim")
    luis = await make_partner(client)
    publiee = (await client.post(BASE, json=annonce(), headers=karim["headers"])).json()

    for _ in range(2):
        reponse = await client.post(
            f"{BASE}/{publiee['id']}/replies", json={"message": "Partant !"}, headers=luis["headers"]
        )
        assert reponse.status_code == 200

    assert await database.announcement_replies.count_documents({}) == 1
    assert reponse.json()["replies_count"] == 1
    assert len(pushes) == 1


async def test_on_ne_repond_ni_a_soi_meme_ni_a_une_annonce_fermee(client, database):
    karim = await register(client, "karim@exemple.com", "Karim")
    luis = await make_partner(client)
    publiee = (await client.post(BASE, json=annonce(), headers=karim["headers"])).json()
    url = f"{BASE}/{publiee['id']}/replies"

    soi_meme = await client.post(url, json={"message": "Moi !"}, headers=karim["headers"])
    assert soi_meme.status_code == 409

    await database.announcements.update_one(
        {"_id": ObjectId(publiee["id"])},
        {"$set": {"expires_at": datetime.now(timezone.utc) - timedelta(minutes=1)}},
    )
    expiree = await client.post(url, json={"message": "Partant !"}, headers=luis["headers"])
    assert expiree.status_code == 409

    await database.announcements.update_one(
        {"_id": ObjectId(publiee["id"])},
        {"$set": {"expires_at": datetime.now(timezone.utc) + timedelta(days=1), "status": "closed"}},
    )
    fermee = await client.post(url, json={"message": "Partant !"}, headers=luis["headers"])
    assert fermee.status_code == 409

    assert await database.announcement_replies.count_documents({}) == 0


async def test_une_reponse_qui_contourne_la_plateforme_est_bloquee(client, database, pushes):
    karim = await register(client, "karim@exemple.com", "Karim")
    luis = await make_partner(client)
    publiee = (await client.post(BASE, json=annonce(), headers=karim["headers"])).json()

    reponse = await client.post(
        f"{BASE}/{publiee['id']}/replies",
        json={"message": "Paie-moi par PayPal, sans passer par l'appli."},
        headers=luis["headers"],
    )

    assert reponse.status_code == 422
    assert await database.announcement_replies.count_documents({}) == 0
    assert pushes == []


async def test_seul_l_auteur_clot_ou_supprime_son_annonce(client, database):
    karim = await register(client, "karim@exemple.com", "Karim")
    luis = await make_partner(client)
    publiee = (await client.post(BASE, json=annonce(), headers=karim["headers"])).json()
    await client.post(f"{BASE}/{publiee['id']}/replies", json={"message": "Partant !"}, headers=luis["headers"])

    assert (await client.post(f"{BASE}/{publiee['id']}/close", headers=luis["headers"])).status_code == 404
    assert (await client.delete(f"{BASE}/{publiee['id']}", headers=luis["headers"])).status_code == 404

    close = await client.post(f"{BASE}/{publiee['id']}/close", headers=karim["headers"])
    assert close.json()["status"] == "closed"
    # Une annonce pourvue garde ses réponses pour son auteur…
    assert len(close.json()["replies"]) == 1
    # … et reste consultable, depuis une notification par exemple.
    assert (await client.get(f"{BASE}/{publiee['id']}", headers=luis["headers"])).status_code == 200

    supprimee = await client.delete(f"{BASE}/{publiee['id']}", headers=karim["headers"])
    assert supprimee.status_code == 204
    assert await database.announcements.count_documents({}) == 0
    assert await database.announcement_replies.count_documents({}) == 0
    assert (await client.get(f"{BASE}/{publiee['id']}", headers=karim["headers"])).status_code == 404


async def test_mes_annonces_garde_les_annonces_pourvues(client):
    karim = await register(client, "karim@exemple.com", "Karim")
    ana = await register(client, "ana@exemple.com", "Ana")
    premiere = (await client.post(BASE, json=annonce(), headers=karim["headers"])).json()
    await client.post(BASE, json=annonce(kind="fight", message="Adversaire pour un interclub en novembre."), headers=karim["headers"])
    await client.post(BASE, json=annonce(), headers=ana["headers"])
    await client.post(f"{BASE}/{premiere['id']}/close", headers=karim["headers"])

    mes = (await client.get(f"{BASE}/mine", headers=karim["headers"])).json()

    assert mes["total"] == 2
    assert {item["status"] for item in mes["items"]} == {"open", "closed"}
    assert all(item["is_mine"] for item in mes["items"])


async def test_identifiant_invalide(client):
    karim = await register(client, "karim@exemple.com", "Karim")

    assert (await client.get(f"{BASE}/pas-un-id", headers=karim["headers"])).status_code == 404
    assert (await client.get(f"{BASE}/{ObjectId()}", headers=karim["headers"])).status_code == 404


async def test_les_annonces_exigent_une_connexion(client):
    assert (await client.get(BASE)).status_code == 401
    assert (await client.post(BASE, json=annonce())).status_code == 401


async def test_supprimer_son_compte_emporte_ses_annonces_et_ses_reponses(client, database):
    karim = await register(client, "karim@exemple.com", "Karim")
    luis = await make_partner(client)
    ana = await register(client, "ana@exemple.com", "Ana")

    de_karim = (await client.post(BASE, json=annonce(), headers=karim["headers"])).json()
    d_ana = (await client.post(BASE, json=annonce(), headers=ana["headers"])).json()
    await client.post(f"{BASE}/{de_karim['id']}/replies", json={"message": "Partant !"}, headers=luis["headers"])
    await client.post(f"{BASE}/{d_ana['id']}/replies", json={"message": "Moi aussi"}, headers=karim["headers"])
    await client.post(f"{BASE}/{d_ana['id']}/replies", json={"message": "Et moi"}, headers=luis["headers"])

    assert (await client.delete("/api/v1/auth/me", headers=karim["headers"])).status_code == 204

    # Son annonce part, avec la réponse qu'elle avait reçue.
    assert await database.announcements.find_one({"_id": ObjectId(de_karim["id"])}) is None
    assert await database.announcement_replies.count_documents({"announcement_id": ObjectId(de_karim["id"])}) == 0
    # Sa réponse à l'annonce d'Ana part aussi, et le compteur suit.
    vue_par_ana = (await client.get(f"{BASE}/{d_ana['id']}", headers=ana["headers"])).json()
    assert vue_par_ana["replies_count"] == 1
    assert [reponse["author"]["first_name"] for reponse in vue_par_ana["replies"]] == ["Luis"]
