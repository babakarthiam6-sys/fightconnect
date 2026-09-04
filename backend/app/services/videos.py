"""Reconnaissance des liens vidéo déposés sur un profil.

Aucun appel réseau n'est fait ici, volontairement. Les oEmbed de TikTok et
Instagram limitent les adresses de centre de données et tombent sans prévenir :
en dépendre à l'enregistrement rendrait l'ajout d'une vidéo tributaire d'un
service tiers, pour une simple vignette. YouTube expose la sienne dans une URL
déductible de l'identifiant, on la construit donc localement ; pour les autres
plateformes la vignette reste absente et le client affiche une tuile de repli.
"""

import re
from typing import Any
from urllib.parse import parse_qs, urlparse

# Ordre d'essai indifférent : les domaines ne se recouvrent pas.
_YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"}
_TIKTOK_HOSTS = {"tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"}
_INSTAGRAM_HOSTS = {"instagram.com", "www.instagram.com"}

_YOUTUBE_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


def _youtube_id(url: str) -> str | None:
    """Extrait l'identifiant d'une URL YouTube, quelle que soit sa forme."""
    parsed = urlparse(url)
    host = parsed.netloc.lower()

    if host in {"youtu.be", "www.youtu.be"}:
        candidate = parsed.path.lstrip("/").split("/")[0]
    elif parsed.path.startswith(("/shorts/", "/embed/", "/live/", "/v/")):
        parts = [part for part in parsed.path.split("/") if part]
        candidate = parts[1] if len(parts) > 1 else ""
    else:
        candidate = parse_qs(parsed.query).get("v", [""])[0]

    return candidate if _YOUTUBE_ID.match(candidate) else None


def identify(url: str) -> dict[str, Any] | None:
    """Renvoie la plateforme et la vignette d'un lien, ou `None` s'il est refusé.

    Seules les plateformes reconnues sont acceptées : un lien quelconque
    afficherait une tuile morte dans la galerie, et laisserait la porte ouverte à
    des adresses qui n'ont rien à faire sur un profil.
    """
    url = (url or "").strip()
    if not url:
        return None

    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None

    host = parsed.netloc.lower()

    if host in _YOUTUBE_HOSTS:
        video_id = _youtube_id(url)
        if video_id is None:
            return None
        return {
            "provider": "youtube",
            # Toujours servie en https par YouTube, et disponible sans clé.
            "thumbnail_url": f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
        }

    if host in _TIKTOK_HOSTS:
        return {"provider": "tiktok", "thumbnail_url": None}

    if host in _INSTAGRAM_HOSTS:
        # Les liens de profil ne mènent à aucune vidéo : on exige un permalien
        # de publication ou de réel.
        if not parsed.path.startswith(("/p/", "/reel/", "/reels/", "/tv/")):
            return None
        return {"provider": "instagram", "thumbnail_url": None}

    return None
