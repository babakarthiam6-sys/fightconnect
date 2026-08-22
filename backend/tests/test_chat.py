"""Discussion : modération, historique, non-lus, notifications."""

import pytest

from app.services import chat as chat_service
from app.services.moderation import detect_payment_bypass
from tests.conftest import make_partner, register


@pytest.mark.parametrize(
    "message",
    [
        "On se retrouve à 14h devant la salle.",
        "Tu peux me rappeler au 06 12 34 56 78 en arrivant ?",
        "Ramène tes gants 14 oz, j’ai des protège-tibias en rab.",
        "Je débute, on peut y aller doucement au début ?",
    ],
)
def test_un_message_ordinaire_passe(message):
    """Signaler à tort fait plus de dégâts que laisser passer : un numéro de
    téléphone dans « je t'appelle en arrivant » est légitime."""
    assert detect_payment_bypass(message).flagged is False


@pytest.mark.parametrize(
    "message",
    [
        "On fait ça en espèces pour éviter les frais.",
        "Paie-moi en liquide, appelle-moi au 06 12 34 56 78.",
        "Envoie sur PayPal, sans passer par l’appli.",
        "On continue sur WhatsApp, 06 12 34 56 78.",
    ],
)
def test_une_esquive_de_paiement_est_signalee(message):
    verdict = detect_payment_bypass(message)
    assert verdict.flagged is True
    assert verdict.reason == "payment_bypass"


@pytest.mark.asyncio
async def test_un_message_signale_n_est_ni_enregistre_ni_transmis(client, database):
    """Contrairement à un avis, où un faux négatif vaut mieux qu'une perte, un
    message frauduleux transmis fait sortir la transaction de la plateforme."""
    luis = await make_partner(client)
    ana = await register(client, "ana@exemple.com", "Ana")

    expediteur = await database.users.find_one({"email": "ana@exemple.com"})
    destinataire = await database.users.find_one({"email": "luis@exemple.com"})

    reponse = await chat_service.handle_message(
        database, expediteur, destinataire["_id"], "Paie-moi en liquide au 06 12 34 56 78"
    )

    assert reponse["type"] == "blocked"
    assert reponse["reason"] == "payment_bypass"
    assert await database.messages.count_documents({}) == 0
    assert luis["user"]["id"] and ana["user"]["id"]


@pytest.mark.asyncio
async def test_un_message_ordinaire_est_enregistre(client, database):
    await make_partner(client)
    await register(client, "ana@exemple.com", "Ana")

    expediteur = await database.users.find_one({"email": "ana@exemple.com"})
    destinataire = await database.users.find_one({"email": "luis@exemple.com"})

    reponse = await chat_service.handle_message(
        database, expediteur, destinataire["_id"], "Salut, dispo samedi 18h ?"
    )

    assert reponse["type"] == "message"
    assert reponse["message"]["content"] == "Salut, dispo samedi 18h ?"
    assert reponse["message"]["author"]["first_name"] == "Ana"
    assert await database.messages.count_documents({}) == 1


@pytest.mark.asyncio
async def test_les_deux_sens_partagent_le_meme_fil(client, database):
    """L'ordre d'ouverture ne doit pas créer deux conversations distinctes."""
    await make_partner(client)
    await register(client, "ana@exemple.com", "Ana")

    ana = await database.users.find_one({"email": "ana@exemple.com"})
    luis = await database.users.find_one({"email": "luis@exemple.com"})

    await chat_service.handle_message(database, ana, luis["_id"], "Salut !")
    await chat_service.handle_message(database, luis, ana["_id"], "Salut, oui dispo.")

    fils = await database.messages.distinct("conversation_id")
    assert len(fils) == 1


@pytest.mark.asyncio
async def test_l_historique_marque_les_messages_comme_lus(client, database):
    luis = await make_partner(client)
    ana = await register(client, "ana@exemple.com", "Ana")

    expediteur = await database.users.find_one({"email": "ana@exemple.com"})
    destinataire = await database.users.find_one({"email": "luis@exemple.com"})
    await chat_service.handle_message(database, expediteur, destinataire["_id"], "Dispo samedi ?")

    avant = await client.get("/api/v1/chat/conversations", headers=luis["headers"])
    assert avant.json()["items"][0]["unread"] == 1

    lecture = await client.get(
        f"/api/v1/chat/history/{ana['user']['id']}", headers=luis["headers"]
    )
    assert lecture.json()["total"] == 1

    apres = await client.get("/api/v1/chat/conversations", headers=luis["headers"])
    assert apres.json()["items"][0]["unread"] == 0


@pytest.mark.asyncio
async def test_l_historique_est_cloisonne(client, database):
    """Un tiers ne doit rien voir de la conversation des deux autres."""
    luis = await make_partner(client)
    ana = await register(client, "ana@exemple.com", "Ana")
    curieux = await register(client, "curieux@exemple.com", "Max")

    expediteur = await database.users.find_one({"email": "ana@exemple.com"})
    destinataire = await database.users.find_one({"email": "luis@exemple.com"})
    await chat_service.handle_message(database, expediteur, destinataire["_id"], "Dispo samedi ?")

    fils = await client.get("/api/v1/chat/conversations", headers=curieux["headers"])
    assert fils.json()["total"] == 0

    entre_eux = await client.get(
        f"/api/v1/chat/history/{luis['user']['id']}", headers=curieux["headers"]
    )
    assert entre_eux.json()["total"] == 0


@pytest.mark.asyncio
async def test_une_notification_part_quand_le_destinataire_est_absent(
    client, database, monkeypatch
):
    envoyees = []

    async def faux_envoi(token, title, body, data=None):
        envoyees.append({"token": token, "title": title, "body": body})
        return True

    monkeypatch.setattr(chat_service, "send_push", faux_envoi)

    luis = await make_partner(client)
    await register(client, "ana@exemple.com", "Ana")
    await client.put(
        "/api/v1/chat/push-token",
        json={"expo_push_token": "ExponentPushToken[abc123]"},
        headers=luis["headers"],
    )

    expediteur = await database.users.find_one({"email": "ana@exemple.com"})
    destinataire = await database.users.find_one({"email": "luis@exemple.com"})
    await chat_service.handle_message(database, expediteur, destinataire["_id"], "Dispo samedi ?")

    assert len(envoyees) == 1
    assert envoyees[0]["token"] == "ExponentPushToken[abc123]"
    assert "Ana" in envoyees[0]["title"]


@pytest.mark.asyncio
async def test_aucune_notification_quand_le_destinataire_est_connecte(
    client, database, monkeypatch
):
    """Recevoir une alerte pour un message qu'on lit à l'écran est le meilleur
    moyen de faire couper les notifications."""
    envoyees = []

    async def faux_envoi(token, title, body, data=None):
        envoyees.append(token)
        return True

    class SocketFactice:
        def __init__(self):
            self.reçus = []

        async def send_json(self, payload):
            self.reçus.append(payload)

    monkeypatch.setattr(chat_service, "send_push", faux_envoi)

    luis = await make_partner(client)
    await register(client, "ana@exemple.com", "Ana")
    await client.put(
        "/api/v1/chat/push-token",
        json={"expo_push_token": "ExponentPushToken[abc123]"},
        headers=luis["headers"],
    )

    expediteur = await database.users.find_one({"email": "ana@exemple.com"})
    destinataire = await database.users.find_one({"email": "luis@exemple.com"})

    socket = SocketFactice()
    chat_service.registry._sockets[str(destinataire["_id"])] = {socket}
    try:
        await chat_service.handle_message(
            database, expediteur, destinataire["_id"], "Dispo samedi ?"
        )
    finally:
        chat_service.registry._sockets.pop(str(destinataire["_id"]), None)

    assert envoyees == []
    assert socket.reçus[0]["type"] == "message"


@pytest.mark.asyncio
async def test_un_jeton_qui_n_est_pas_d_expo_est_ignore(client, database, monkeypatch):
    """Envoyer n'importe quelle chaîne à Expo ferait échouer le lot entier."""
    from app.services import notifications

    appels = []

    async def faux_post(*args, **kwargs):
        appels.append(args)
        raise AssertionError("Expo ne devrait pas être appelé.")

    monkeypatch.setattr(notifications.httpx, "AsyncClient", faux_post)

    assert await notifications.send_push("pas-un-jeton", "titre", "corps") is False
    assert await notifications.send_push(None, "titre", "corps") is False
    assert appels == []


@pytest.mark.asyncio
async def test_la_discussion_exige_une_authentification(client):
    assert (await client.get("/api/v1/chat/conversations")).status_code == 401
    assert (await client.get("/api/v1/chat/history/abc")).status_code == 401


def test_le_fil_temps_reel_achemine_un_message(database):
    """Le WebSocket, de bout en bout.

    Un client synchrone est nécessaire : le transport ASGI d'httpx ne gère pas
    les WebSocket. Ce test n'existerait pas si le point d'entrée appelait la
    base directement au lieu de passer par la dépendance.
    """
    import asyncio

    from fastapi.testclient import TestClient

    from app.database import get_database
    from app.main import create_app
    from app.security import create_access_token, hash_password

    async def semer():
        ana = await database.users.insert_one(
            {"email": "ana@ws.test", "first_name": "Ana", "last_name": "M",
             "password_hash": hash_password("Sparring1")}
        )
        luis = await database.users.insert_one(
            {"email": "luis@ws.test", "first_name": "Luis", "last_name": "D",
             "password_hash": hash_password("Sparring1")}
        )
        return ana.inserted_id, luis.inserted_id

    ana_id, luis_id = asyncio.get_event_loop().run_until_complete(semer())

    app = create_app()
    app.dependency_overrides[get_database] = lambda: database

    with TestClient(app) as http:
        jeton_ana = create_access_token(str(ana_id))
        jeton_luis = create_access_token(str(luis_id))

        with http.websocket_connect(f"/api/v1/chat/ws?token={jeton_luis}") as luis_ws:
            with http.websocket_connect(f"/api/v1/chat/ws?token={jeton_ana}") as ana_ws:
                ana_ws.send_json({"recipient_id": str(luis_id), "content": "Dispo samedi ?"})

                # L'expéditeur reçoit son propre message en accusé…
                echo = ana_ws.receive_json()
                assert echo["type"] == "message"
                assert echo["message"]["content"] == "Dispo samedi ?"
                assert echo["delivered"] is True

                # …et le destinataire le reçoit sans avoir rien demandé.
                recu = luis_ws.receive_json()
                assert recu["type"] == "message"
                assert recu["message"]["author"]["first_name"] == "Ana"


def test_le_fil_refuse_un_jeton_invalide(database):
    from fastapi.testclient import TestClient
    from starlette.websockets import WebSocketDisconnect

    from app.database import get_database
    from app.main import create_app

    app = create_app()
    app.dependency_overrides[get_database] = lambda: database

    with TestClient(app) as http:
        with pytest.raises(WebSocketDisconnect):
            with http.websocket_connect("/api/v1/chat/ws?token=pas-un-jeton") as socket:
                socket.receive_json()
