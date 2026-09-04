"""Galerie vidéo d'un profil.

Une note sur cinq étoiles dit qu'un partenaire est apprécié ; elle ne dit pas
s'il tape pour apprendre ou pour gagner. Trente secondes de sparring, si. C'est
la seule raison d'être de cette galerie, et c'est pourquoi elle est publique dès
qu'un profil l'est.

Rien n'est hébergé ici : on ne conserve qu'un lien vers la plateforme où la
vidéo vit déjà. Les combattants filment sur TikTok et Instagram, pas dans notre
application — coller un lien leur demande moins d'efforts que téléverser un
fichier, et nous évite l'hébergement, le transcodage, la modération d'images et
les droits sur des séquences de gala qui ne leur appartiennent pas toujours.
"""

from uuid import uuid4

from fastapi import APIRouter, HTTPException, status

from app.dependencies import CurrentUser, Database
from app.schemas import MAX_VIDEOS, VIDEO_KINDS, VideoCreate, VideoList, VideoOrder
from app.serializers import serialize_videos
from app.services.videos import identify

router = APIRouter(prefix="/videos", tags=["videos"])


def _invalide(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)


async def _remplacer(database, user, videos: list[dict]) -> dict:
    """Écrit la galerie et renvoie la réponse, dans l'ordre demandé."""
    await database.users.update_one({"_id": user["_id"]}, {"$set": {"videos": videos}})
    return {"items": serialize_videos({"videos": videos})}


@router.post("", response_model=VideoList, status_code=status.HTTP_201_CREATED)
async def add_video(
    payload: VideoCreate,
    database: Database,
    current_user: CurrentUser,
) -> dict:
    """Ajoute une vidéo à sa propre galerie et renvoie la galerie complète.

    La galerie entière est renvoyée plutôt que la seule vidéo ajoutée : l'écran
    l'affiche en grille, et lui faire recoller un élément dans une liste qu'il
    maintient de son côté est une source d'écarts pour rien.
    """
    if payload.kind not in VIDEO_KINDS:
        raise _invalide(f"Nature de vidéo inconnue : {payload.kind}.")

    reconnu = identify(payload.url)
    if reconnu is None:
        raise _invalide(
            "Lien non reconnu. Colle une vidéo YouTube, TikTok ou Instagram "
            "(publication ou réel)."
        )

    videos = list(current_user.get("videos") or [])
    if len(videos) >= MAX_VIDEOS:
        raise _invalide(f"Ta galerie est pleine ({MAX_VIDEOS} vidéos). Retires-en une d'abord.")

    url = payload.url.strip()
    if any(entry.get("url") == url for entry in videos):
        raise _invalide("Cette vidéo est déjà dans ta galerie.")

    caption = (payload.caption or "").strip() or None
    videos.append(
        {
            "id": uuid4().hex,
            "url": url,
            "kind": payload.kind,
            "caption": caption,
            **reconnu,
        }
    )
    return await _remplacer(database, current_user, videos)


@router.delete("/{video_id}", response_model=VideoList)
async def remove_video(
    video_id: str,
    database: Database,
    current_user: CurrentUser,
) -> dict:
    """Retire une vidéo de sa propre galerie."""
    videos = list(current_user.get("videos") or [])
    restantes = [entry for entry in videos if entry.get("id") != video_id]
    if len(restantes) == len(videos):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cette vidéo n'est pas dans ta galerie.",
        )
    return await _remplacer(database, current_user, restantes)


@router.put("/order", response_model=VideoList)
async def reorder_videos(
    payload: VideoOrder,
    database: Database,
    current_user: CurrentUser,
) -> dict:
    """Réordonne la galerie ; la première vidéo devient la couverture.

    L'ordre reçu doit décrire la galerie exactement : un identifiant manquant
    supprimerait une vidéo sans que l'utilisateur l'ait demandé, un identifiant
    en trop en inventerait une.
    """
    videos = list(current_user.get("videos") or [])
    par_id = {entry.get("id"): entry for entry in videos}

    if len(payload.ids) != len(videos) or set(payload.ids) != set(par_id):
        raise _invalide("L'ordre envoyé ne correspond pas à ta galerie.")

    return await _remplacer(database, current_user, [par_id[video_id] for video_id in payload.ids])
