"""Suppression de compte, signalement, blocage.

Ces trois fonctions ne sont pas du confort : ce sont les trois exigences
d'Apple et de Google qui font qu'une application avec des comptes et des
messages est acceptée ou retirée. Elles sont donc testées comme des invariants,
pas comme des options.
"""

from datetime import datetime, timedelta, timezone

import pytest
from bson import ObjectId

from tests.conftest import booking_payload, make_partner, register

SEC = "/api/v1/securite"


# ---------------------------------------------------------------------------
# Suppression du compte — Apple 5.1.1(v)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_le_compte_disparait_vraiment(client, database):
    ana = await register(client, email="ana@exemple.com", first_name="Ana")

    response = await client.request(
        "DELETE", "/api/v1/auth/me", json={"password": "Sparring1"}, headers=ana["headers"]
    )

    assert response.status_code == 200
    assert response.json()["supprime"] is True
    assert await database.users.find_one({"email": "ana@exemple.com"}) is None


@pytest.mark.asyncio
async def test_le_jeton_ne_vaut_plus_rien_apres_suppression(client):
    """Un jeton qui survit à son compte est un compte qui n'est pas supprimé."""
    ana = await register(client, email="ana@exemple.com", first_name="Ana")
    await client.request(
        "DELETE", "/api/v1/auth/me", json={"password": "Sparring1"}, headers=ana["headers"]
    )

    apres = await client.get("/api/v1/auth/me", headers=ana["headers"])

    assert apres.status_code == 401


@pytest.mark.asyncio
async def test_un_mauvais_mot_de_passe_ne_supprime_rien(client, database):
    """Le seul geste irréversible de l'application se confirme."""
    ana = await register(client, email="ana@exemple.com", first_name="Ana")

    response = await client.request(
        "DELETE", "/api/v1/auth/me", json={"password": "PasLeBon1"}, headers=ana["headers"]
    )

    assert response.status_code == 401
    assert await database.users.find_one({"email": "ana@exemple.com"}) is not None


@pytest.mark.asyncio
async def test_une_seance_payee_a_venir_bloque_la_suppression(client, database):
    """Supprimer laisserait l'argent d'un tiers sans contrepartie."""
    luis = await make_partner(client)
    ana = await register(client, email="ana@exemple.com", first_name="Ana")
    demande = await client.post(
        "/api/v1/bookings", json=booking_payload(luis["user"]["id"]), headers=ana["headers"]
    )
    await database.bookings.update_one(
        {"_id": ObjectId(demande.json()["id"])}, {"$set": {"paid": True}}
    )

    response = await client.request(
        "DELETE", "/api/v1/auth/me", json={"password": "Sparring1"}, headers=ana["headers"]
    )

    assert response.status_code == 409
    assert await database.users.find_one({"email": "ana@exemple.com"}) is not None


@pytest.mark.asyncio
async def test_une_seance_passee_ne_bloque_pas(client, database):
    """Seul l'argent encore en jeu compte ; l'historique, non."""
    luis = await make_partner(client)
    ana = await register(client, email="ana@exemple.com", first_name="Ana")
    demande = await client.post(
        "/api/v1/bookings", json=booking_payload(luis["user"]["id"]), headers=ana["headers"]
    )
    await database.bookings.update_one(
        {"_id": ObjectId(demande.json()["id"])},
        {
            "$set": {
                "paid": True,
                "scheduled_at": datetime.now(timezone.utc) - timedelta(days=3),
                "status": "completed",
            }
        },
    )

    response = await client.request(
        "DELETE", "/api/v1/auth/me", json={"password": "Sparring1"}, headers=ana["headers"]
    )

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_les_demandes_en_cours_sont_annulees(client, database):
    """Personne ne doit rester en attente d'une réponse qui ne viendra jamais."""
    luis = await make_partner(client)
    ana = await register(client, email="ana@exemple.com", first_name="Ana")
    demande = await client.post(
        "/api/v1/bookings", json=booking_payload(luis["user"]["id"]), headers=ana["headers"]
    )

    await client.request(
        "DELETE", "/api/v1/auth/me", json={"password": "Sparring1"}, headers=ana["headers"]
    )

    apres = await database.bookings.find_one({"_id": ObjectId(demande.json()["id"])})
    assert apres["status"] == "cancelled"


@pytest.mark.asyncio
async def test_les_messages_restent_mais_perdent_leur_auteur(client, database):
    """Effacer les messages trouerait la conversation de l'autre personne, et
    effacerait la preuve d'un abus qu'elle vient peut-être de signaler."""
    luis = await make_partner(client)
    ana = await register(client, email="ana@exemple.com", first_name="Ana")
    await database.messages.insert_one(
        {
            "conversation_id": "x",
            "sender_id": ObjectId(ana["user"]["id"]),
            "recipient_id": ObjectId(luis["user"]["id"]),
            "content": "Bonjour",
            "read": False,
            "created_at": datetime.now(timezone.utc),
        }
    )

    await client.request(
        "DELETE", "/api/v1/auth/me", json={"password": "Sparring1"}, headers=ana["headers"]
    )

    message = await database.messages.find_one({"content": "Bonjour"})
    assert message is not None, "le message de l'autre personne ne doit pas disparaître"
    assert message["sender_deleted"] is True


# ---------------------------------------------------------------------------
# Signalement — Apple 1.2
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_signaler_enregistre_sans_rien_dire_a_la_cible(client, database):
    luis = await make_partner(client)
    ana = await register(client, email="ana@exemple.com", first_name="Ana")

    response = await client.post(
        f"{SEC}/reports",
        json={"target_type": "user", "target_id": luis["user"]["id"], "reason": "harcelement"},
        headers=ana["headers"],
    )

    assert response.status_code == 201
    assert await database.reports.count_documents({}) == 1


@pytest.mark.asyncio
async def test_signaler_deux_fois_ne_compte_qu_une_fois(client, database):
    """Réappuyer sur le bouton ne doit pas gonfler un compteur que la
    modération lit comme une mesure de gravité."""
    luis = await make_partner(client)
    ana = await register(client, email="ana@exemple.com", first_name="Ana")
    corps = {"target_type": "user", "target_id": luis["user"]["id"], "reason": "arnaque"}

    await client.post(f"{SEC}/reports", json=corps, headers=ana["headers"])
    await client.post(f"{SEC}/reports", json=corps, headers=ana["headers"])

    assert await database.reports.count_documents({}) == 1


@pytest.mark.asyncio
async def test_un_motif_invente_est_refuse(client):
    luis = await make_partner(client)
    ana = await register(client, email="ana@exemple.com", first_name="Ana")

    response = await client.post(
        f"{SEC}/reports",
        json={"target_type": "user", "target_id": luis["user"]["id"], "reason": "il_m_enerve"},
        headers=ana["headers"],
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_on_ne_se_signale_pas_soi_meme(client):
    ana = await register(client, email="ana@exemple.com", first_name="Ana")

    response = await client.post(
        f"{SEC}/reports",
        json={"target_type": "user", "target_id": ana["user"]["id"], "reason": "autre"},
        headers=ana["headers"],
    )

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Blocage — Apple 1.2, et le seul qui protège vraiment
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bloquer_retire_des_deux_recherches(client):
    """Un blocage à sens unique laisserait le bloqueur croiser le nom qu'il
    vient d'écarter."""
    luis = await make_partner(client)
    ana = await make_partner(client, email="ana@exemple.com", first_name="Ana")

    avant = await client.get("/api/v1/partners", headers=ana["headers"])
    assert avant.json()["total"] == 1

    await client.post(f"{SEC}/blocks/{luis['user']['id']}", headers=ana["headers"])

    cote_ana = await client.get("/api/v1/partners", headers=ana["headers"])
    cote_luis = await client.get("/api/v1/partners", headers=luis["headers"])
    assert cote_ana.json()["total"] == 0
    assert cote_luis.json()["total"] == 0


@pytest.mark.asyncio
async def test_la_fiche_d_un_bloque_repond_introuvable(client):
    """Masquer de la recherche sans fermer la fiche laisserait un lien direct
    fonctionner. On répond 404 : dire « vous êtes bloqué » ne sert qu'à
    contourner le blocage."""
    luis = await make_partner(client)
    ana = await register(client, email="ana@exemple.com", first_name="Ana")
    await client.post(f"{SEC}/blocks/{luis['user']['id']}", headers=ana["headers"])

    response = await client.get(f"/api/v1/partners/{luis['user']['id']}", headers=ana["headers"])

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_on_ne_reserve_pas_quelqu_un_qu_on_a_bloque(client):
    luis = await make_partner(client)
    ana = await register(client, email="ana@exemple.com", first_name="Ana")
    await client.post(f"{SEC}/blocks/{luis['user']['id']}", headers=ana["headers"])

    response = await client.post(
        "/api/v1/bookings", json=booking_payload(luis["user"]["id"]), headers=ana["headers"]
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_bloquer_annule_les_demandes_impayees(client, database):
    luis = await make_partner(client)
    ana = await register(client, email="ana@exemple.com", first_name="Ana")
    demande = await client.post(
        "/api/v1/bookings", json=booking_payload(luis["user"]["id"]), headers=ana["headers"]
    )

    await client.post(f"{SEC}/blocks/{luis['user']['id']}", headers=ana["headers"])

    apres = await database.bookings.find_one({"_id": ObjectId(demande.json()["id"])})
    assert apres["status"] == "cancelled"


@pytest.mark.asyncio
async def test_debloquer_rend_la_recherche(client):
    luis = await make_partner(client)
    ana = await make_partner(client, email="ana@exemple.com", first_name="Ana")
    await client.post(f"{SEC}/blocks/{luis['user']['id']}", headers=ana["headers"])

    await client.delete(f"{SEC}/blocks/{luis['user']['id']}", headers=ana["headers"])

    apres = await client.get("/api/v1/partners", headers=ana["headers"])
    assert apres.json()["total"] == 1


@pytest.mark.asyncio
async def test_la_liste_ne_dit_pas_qui_vous_a_bloque(client):
    """Savoir qui vous a bloqué sert surtout à contourner le blocage."""
    luis = await make_partner(client)
    ana = await register(client, email="ana@exemple.com", first_name="Ana")
    await client.post(f"{SEC}/blocks/{ana['user']['id']}", headers=luis["headers"])

    liste = await client.get(f"{SEC}/blocks", headers=ana["headers"])

    assert liste.json()["total"] == 0


@pytest.mark.asyncio
async def test_on_ne_se_bloque_pas_soi_meme(client):
    ana = await register(client, email="ana@exemple.com", first_name="Ana")

    response = await client.post(f"{SEC}/blocks/{ana['user']['id']}", headers=ana["headers"])

    assert response.status_code == 422
