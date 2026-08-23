"""Connexions de discussion ouvertes, et acheminement d'un message.

Le registre vit en mémoire : il décrit qui est connecté *à ce processus*. Avec
plusieurs instances, un destinataire connecté ailleurs sera considéré absent et
recevra une notification — un message de trop, jamais un message perdu.
"""

import logging
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import WebSocket
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.i18n import t
from app.routers.securite import est_bloque
from app.serializers import serialize_message, serialize_user_summary
from app.services.moderation import moderate_message
from app.services.notifications import send_push

logger = logging.getLogger(__name__)


def conversation_key(a: ObjectId, b: ObjectId) -> str:
    """Identifiant stable d'une conversation entre deux personnes.

    Trié, pour que l'ordre d'ouverture ne crée pas deux fils distincts entre les
    deux mêmes interlocuteurs.
    """
    return "-".join(sorted((str(a), str(b))))


class ConnectionRegistry:
    """Sockets ouverts, indexés par utilisateur.

    Une même personne peut avoir plusieurs onglets ou appareils : la valeur est
    donc un ensemble, pas un socket unique.
    """

    def __init__(self) -> None:
        self._sockets: dict[str, set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str) -> None:
        await websocket.accept()
        self._sockets.setdefault(user_id, set()).add(websocket)

    def disconnect(self, websocket: WebSocket, user_id: str) -> None:
        sockets = self._sockets.get(user_id)
        if not sockets:
            return
        sockets.discard(websocket)
        if not sockets:
            del self._sockets[user_id]

    def is_online(self, user_id: str) -> bool:
        return bool(self._sockets.get(user_id))

    async def send(self, user_id: str, payload: dict[str, Any]) -> bool:
        """Diffuse à tous les sockets d'une personne. `False` si aucun n'a reçu."""
        sockets = list(self._sockets.get(user_id, ()))
        if not sockets:
            return False

        delivered = False
        for socket in sockets:
            try:
                await socket.send_json(payload)
                delivered = True
            except Exception:  # noqa: BLE001 — socket mort, on le retire
                self.disconnect(socket, user_id)
        return delivered


registry = ConnectionRegistry()


async def handle_message(
    database: AsyncIOMotorDatabase,
    sender: dict[str, Any],
    recipient_id: ObjectId,
    content: str,
) -> dict[str, Any]:
    """Modère, enregistre, transmet — dans cet ordre.

    Un message signalé n'est ni enregistré ni transmis : contrairement à un avis,
    où un faux négatif vaut mieux qu'une perte, un message frauduleux transmis
    fait sortir la transaction de la plateforme, et c'est irréversible.
    """
    content = content.strip()
    if not content:
        return {"type": "error", "reason": "Message vide."}

    verdict = await moderate_message(content)
    if verdict.flagged:
        return {
            "type": "blocked",
            "reason": verdict.reason,
            "message": t(
                "discussion.contournement"
                if verdict.reason == "payment_bypass"
                else "discussion.signale"
            ),
        }

    recipient = await database.users.find_one({"_id": recipient_id})
    if recipient is None:
        return {"type": "error", "reason": t("discussion.interlocuteur_introuvable")}

    # C'est ici que le blocage compte vraiment. Le masquer de la recherche sans
    # arrêter les messages laisserait passer exactement ce dont il protège :
    # quelqu'un qui écrit à qui ne veut plus l'entendre.
    if await est_bloque(database, sender["_id"], recipient_id):
        return {"type": "blocked", "reason": "blocked", "message": t("securite.bloque")}

    document = {
        "conversation_id": conversation_key(sender["_id"], recipient_id),
        "sender_id": sender["_id"],
        "recipient_id": recipient_id,
        "content": content,
        "read": False,
        "created_at": datetime.now(timezone.utc),
    }
    result = await database.messages.insert_one(document)
    document["_id"] = result.inserted_id

    payload = {"type": "message", "message": serialize_message(document, sender)}
    delivered = await registry.send(str(recipient_id), payload)

    if not delivered:
        expediteur = serialize_user_summary(sender) or {}
        await send_push(
            recipient.get("expo_push_token"),
            title=f"{expediteur.get('first_name', 'Message')} vous écrit",
            body=content,
            data={"type": "message", "conversation_id": document["conversation_id"]},
        )

    return {**payload, "delivered": delivered}
