"""Discussion entre deux personnes : historique en REST, temps réel en WebSocket."""

from typing import Annotated, Any

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect, status

from app.i18n import t
from app.dependencies import CurrentUser, Database
from app.schemas import ConversationList, MessageList, PushTokenRequest, UserOut
from app.security import decode_access_token
from app.serializers import (
    serialize_conversation,
    serialize_message,
    serialize_user,
    to_object_id,
)
from app.services.chat import conversation_key, handle_message, registry

router = APIRouter(prefix="/chat", tags=["discussion"])


@router.get("/conversations", response_model=ConversationList)
async def conversations(database: Database, current_user: CurrentUser) -> dict[str, Any]:
    """Un fil par interlocuteur, le plus récent d'abord.

    Le dernier message et le nombre de non-lus sont calculés côté base : les
    ramener tous pour les compter ici ferait grossir la réponse avec l'usage.
    """
    user_id: ObjectId = current_user["_id"]

    pipeline = [
        {"$match": {"$or": [{"sender_id": user_id}, {"recipient_id": user_id}]}},
        {"$sort": {"created_at": -1}},
        {
            "$group": {
                "_id": "$conversation_id",
                "last": {"$first": "$$ROOT"},
                "unread": {
                    "$sum": {
                        "$cond": [
                            {
                                "$and": [
                                    {"$eq": ["$recipient_id", user_id]},
                                    {"$eq": ["$read", False]},
                                ]
                            },
                            1,
                            0,
                        ]
                    }
                },
            }
        },
        {"$sort": {"last.created_at": -1}},
        {"$limit": 100},
    ]

    groupes = [groupe async for groupe in database.messages.aggregate(pipeline)]

    autres_ids = {
        groupe["last"]["sender_id"]
        if groupe["last"]["sender_id"] != user_id
        else groupe["last"]["recipient_id"]
        for groupe in groupes
    }
    autres = {
        str(personne["_id"]): personne
        async for personne in database.users.find({"_id": {"$in": list(autres_ids)}})
    }

    items = []
    for groupe in groupes:
        dernier = groupe["last"]
        autre_id = (
            dernier["sender_id"] if dernier["sender_id"] != user_id else dernier["recipient_id"]
        )
        items.append(
            serialize_conversation(
                groupe["_id"], autres.get(str(autre_id)), dernier, int(groupe["unread"])
            )
        )

    return {"items": items, "total": len(items)}


@router.get("/history/{other_id}", response_model=MessageList)
async def history(
    other_id: str,
    database: Database,
    current_user: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> dict[str, Any]:
    """Fil avec une personne. L'ouvrir marque ses messages comme lus."""
    autre = to_object_id(other_id)
    if autre is None:
        raise HTTPException(status_code=404, detail=t("discussion.interlocuteur_introuvable"))

    identifiant = conversation_key(current_user["_id"], autre)

    documents = [
        document
        async for document in database.messages.find({"conversation_id": identifiant})
        .sort("created_at", -1)
        .limit(limit)
    ]
    documents.reverse()

    await database.messages.update_many(
        {"conversation_id": identifiant, "recipient_id": current_user["_id"], "read": False},
        {"$set": {"read": True}},
    )

    auteurs = {
        str(personne["_id"]): personne
        async for personne in database.users.find({"_id": {"$in": [current_user["_id"], autre]}})
    }

    items = [
        serialize_message(document, auteurs.get(str(document.get("sender_id"))))
        for document in documents
    ]
    return {"items": items, "total": len(items)}


@router.put("/push-token", response_model=UserOut)
async def register_push_token(
    payload: PushTokenRequest,
    database: Database,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """Enregistre le jeton de l'appareil, ou le détache s'il est `null`."""
    await database.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"expo_push_token": payload.expo_push_token}},
    )
    refreshed = await database.users.find_one({"_id": current_user["_id"]})
    assert refreshed is not None
    return serialize_user(refreshed)


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    database: Database,
    token: str = Query(...),
) -> None:
    """Fil temps réel.

    Le jeton passe en paramètre d'URL et non en en-tête : l'API WebSocket des
    navigateurs ne permet pas d'ajouter d'en-tête à la poignée de main. Il est
    donc validé ici de la même façon que dans la dépendance HTTP.

    La base arrive par la dépendance, et non par un appel direct à
    `get_database()` : c'est ce qui permet aux tests de la remplacer, et c'est
    faute de l'avoir fait que ce point d'entrée n'en avait aucun.
    """
    user_id = decode_access_token(token)
    object_id = to_object_id(user_id) if user_id else None

    if object_id is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    current_user = await database.users.find_one({"_id": object_id})
    if current_user is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await registry.connect(websocket, str(object_id))
    try:
        while True:
            reçu = await websocket.receive_json()
            destinataire = to_object_id(str(reçu.get("recipient_id", "")))
            if destinataire is None:
                await websocket.send_json(
                    {"type": "error", "reason": "Destinataire manquant ou invalide."}
                )
                continue

            réponse = await handle_message(
                database, current_user, destinataire, str(reçu.get("content", ""))
            )
            await websocket.send_json(réponse)
    except WebSocketDisconnect:
        pass
    finally:
        registry.disconnect(websocket, str(object_id))
