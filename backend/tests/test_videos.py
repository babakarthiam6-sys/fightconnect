"""Galerie vidéo : reconnaissance des liens, limites, ordre, visibilité."""

import pytest

from app.schemas import MAX_VIDEOS
from app.services.videos import identify
from tests.conftest import make_partner, register

YOUTUBE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
TIKTOK = "https://www.tiktok.com/@combattant/video/7123456789012345678"


async def _ajouter(client, compte, url=YOUTUBE, kind="sparring", caption=None):
    return await client.post(
        "/api/v1/videos",
        json={"url": url, "kind": kind, "caption": caption},
        headers=compte["headers"],
    )


# --------------------------------------------------------------- reconnaissance


@pytest.mark.parametrize(
    "url",
    [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtu.be/dQw4w9WgXcQ",
        "https://www.youtube.com/shorts/dQw4w9WgXcQ",
        "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    ],
)
def test_les_formes_d_url_youtube_donnent_la_meme_vignette(url):
    """YouTube expose une vignette déductible de l'identifiant : aucune requête
    réseau n'est nécessaire, quelle que soit la forme du lien collé."""
    assert identify(url) == {
        "provider": "youtube",
        "thumbnail_url": "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    }


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com/ma-video.mp4",
        "javascript:alert(1)",
        "https://www.instagram.com/monprofil/",
        "https://www.youtube.com/watch?v=trop-court",
        "",
    ],
)
def test_les_liens_non_reconnus_sont_refuses(url):
    """Un lien quelconque afficherait une tuile morte dans la grille, et un
    `javascript:` n'a rien à faire dans une donnée rendue par le client."""
    assert identify(url) is None


def test_un_permalien_instagram_est_accepte_sans_vignette():
    """Instagram ne donne pas de vignette sans oEmbed : la galerie affiche une
    tuile de repli plutôt que de dépendre d'un service tiers à l'enregistrement."""
    assert identify("https://www.instagram.com/reel/Cabc123/") == {
        "provider": "instagram",
        "thumbnail_url": None,
    }


# ---------------------------------------------------------------------- ajout


@pytest.mark.asyncio
async def test_ajouter_une_video_renvoie_la_galerie_complete(client):
    luis = await make_partner(client)

    response = await _ajouter(client, luis, caption="Sparring boxe, mars")

    assert response.status_code == 201
    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["provider"] == "youtube"
    assert items[0]["kind"] == "sparring"
    assert items[0]["caption"] == "Sparring boxe, mars"
    assert items[0]["thumbnail_url"].endswith("/hqdefault.jpg")


@pytest.mark.asyncio
async def test_la_plateforme_annoncee_par_le_client_est_ignoree(client):
    """La plateforme est déduite du lien, jamais reçue : sinon n'importe quel
    client pourrait faire passer une adresse arbitraire pour une vidéo YouTube."""
    luis = await make_partner(client)

    response = await client.post(
        "/api/v1/videos",
        json={"url": TIKTOK, "kind": "fight", "provider": "youtube"},
        headers=luis["headers"],
    )

    assert response.json()["items"][0]["provider"] == "tiktok"


@pytest.mark.asyncio
async def test_un_lien_non_reconnu_est_refuse(client):
    luis = await make_partner(client)

    response = await _ajouter(client, luis, url="https://example.com/video.mp4")

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_une_nature_inconnue_est_refusee(client):
    luis = await make_partner(client)

    response = await _ajouter(client, luis, kind="karaoke")

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_la_meme_video_ne_peut_pas_etre_ajoutee_deux_fois(client):
    """Un double appui sur « Ajouter » ne doit pas dédoubler la tuile."""
    luis = await make_partner(client)
    await _ajouter(client, luis)

    response = await _ajouter(client, luis)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_la_galerie_est_plafonnee(client):
    """Au-delà, la grille devient une archive que personne ne déroule."""
    luis = await make_partner(client)
    for index in range(MAX_VIDEOS):
        rempli = await _ajouter(client, luis, url=f"https://youtu.be/dQw4w9WgXc{index}")
        assert rempli.status_code == 201

    response = await _ajouter(client, luis, url="https://youtu.be/dQw4w9WgXcZ")

    assert response.status_code == 422
    assert str(MAX_VIDEOS) in response.json()["detail"]


@pytest.mark.asyncio
async def test_une_galerie_exige_d_etre_connecte(client):
    response = await client.post("/api/v1/videos", json={"url": YOUTUBE, "kind": "fight"})

    assert response.status_code == 401


# ------------------------------------------------------------ retrait et ordre


@pytest.mark.asyncio
async def test_retirer_une_video(client):
    luis = await make_partner(client)
    ajout = await _ajouter(client, luis)
    video_id = ajout.json()["items"][0]["id"]

    response = await client.delete(f"/api/v1/videos/{video_id}", headers=luis["headers"])

    assert response.status_code == 200
    assert response.json()["items"] == []


@pytest.mark.asyncio
async def test_retirer_une_video_absente_ne_touche_pas_la_galerie(client):
    luis = await make_partner(client)
    await _ajouter(client, luis)

    response = await client.delete("/api/v1/videos/inexistante", headers=luis["headers"])

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_reordonner_change_la_couverture(client):
    """La première vidéo sert de couverture : c'est la seule qu'on voit depuis
    la recherche, donc son choix doit appartenir au propriétaire du profil."""
    luis = await make_partner(client)
    await _ajouter(client, luis, url="https://youtu.be/dQw4w9WgXc1")
    deuxieme = await _ajouter(client, luis, url="https://youtu.be/dQw4w9WgXc2")
    ids = [item["id"] for item in deuxieme.json()["items"]]

    response = await client.put(
        "/api/v1/videos/order",
        json={"ids": list(reversed(ids))},
        headers=luis["headers"],
    )

    assert response.status_code == 200
    assert [item["id"] for item in response.json()["items"]] == list(reversed(ids))


@pytest.mark.asyncio
async def test_un_ordre_incomplet_est_refuse(client):
    """Un identifiant manquant supprimerait une vidéo sans que l'utilisateur
    l'ait demandé : on refuse plutôt que d'interpréter."""
    luis = await make_partner(client)
    await _ajouter(client, luis, url="https://youtu.be/dQw4w9WgXc1")
    deuxieme = await _ajouter(client, luis, url="https://youtu.be/dQw4w9WgXc2")
    premier_id = deuxieme.json()["items"][0]["id"]

    response = await client.put(
        "/api/v1/videos/order", json={"ids": [premier_id]}, headers=luis["headers"]
    )

    assert response.status_code == 422


# ------------------------------------------------------------------ visibilité


@pytest.mark.asyncio
async def test_la_galerie_apparait_sur_la_fiche_publique(client):
    """C'est tout l'intérêt : celui qui hésite à réserver doit pouvoir regarder
    avant de s'engager."""
    luis = await make_partner(client)
    await _ajouter(client, luis, kind="fight")
    chercheur = await register(client, email="ana@exemple.com", first_name="Ana")

    response = await client.get(
        f"/api/v1/partners/{luis['user']['id']}", headers=chercheur["headers"]
    )

    videos = response.json()["videos"]
    assert len(videos) == 1
    assert videos[0]["kind"] == "fight"


@pytest.mark.asyncio
async def test_un_profil_sans_video_reste_valide(client):
    """La galerie est facultative : elle ne doit rien changer pour ceux qui n'en
    veulent pas."""
    luis = await make_partner(client)
    chercheur = await register(client, email="ana@exemple.com", first_name="Ana")

    response = await client.get(
        f"/api/v1/partners/{luis['user']['id']}", headers=chercheur["headers"]
    )

    assert response.status_code == 200
    assert response.json()["videos"] == []
