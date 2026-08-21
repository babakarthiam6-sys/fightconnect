"""Notifications push, via le service d'Expo.

Une notification n'est envoyée que lorsque le destinataire n'est pas connecté :
recevoir une alerte pour un message qu'on est en train de lire est le meilleur
moyen de faire couper les notifications.

Aucun échec n'est propagé. Un message correctement enregistré et transmis ne
doit pas échouer parce qu'un service tiers est en panne.
"""

import logging
from typing import Any

import httpx

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
TIMEOUT_SECONDS = 8.0

logger = logging.getLogger(__name__)


def is_expo_token(token: str | None) -> bool:
    """Un jeton Expo a une forme reconnaissable ; tout le reste est ignoré.

    Envoyer n'importe quelle chaîne au service d'Expo ferait échouer le lot
    entier, y compris les jetons valides qui l'accompagnent.
    """
    return isinstance(token, str) and token.startswith(("ExponentPushToken[", "ExpoPushToken["))


async def send_push(
    token: str | None,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
) -> bool:
    """Envoie une notification. Renvoie `False` sans lever si elle n'est pas partie."""
    if not is_expo_token(token):
        return False

    payload = {
        "to": token,
        "sound": "default",
        "title": title,
        # Un aperçu tronqué suffit : la notification invite à ouvrir, elle ne
        # remplace pas la conversation.
        "body": body[:120] + ("…" if len(body) > 120 else ""),
        "data": data or {},
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            response = await client.post(EXPO_PUSH_URL, json=payload)
        if response.status_code != 200:
            logger.warning("Notification refusée par Expo : %s", response.text[:200])
            return False
        return True
    except Exception as error:  # noqa: BLE001 — aucune panne ne doit remonter
        logger.warning("Notification non envoyée : %s", error)
        return False
