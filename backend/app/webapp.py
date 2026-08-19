"""Service de l'application web depuis l'API.

L'export web du mobile référence ses fichiers depuis la racine (`/_expo/...`).
Il est donc monté sur `/`, ce qui donne au passage l'adresse la plus simple pour
l'utilisateur. Le montage doit intervenir **après** toutes les routes de l'API :
monté avant, il les masquerait toutes.

C'est aussi une application à page unique — le routage se fait dans le
navigateur. Un rechargement sur `/sparring/abc` demande au serveur un chemin qui
n'existe pas sur le disque : il faut renvoyer `index.html` et laisser le
navigateur retrouver la bonne page.
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException


class SinglePageApp(StaticFiles):
    """`StaticFiles` qui retombe sur `index.html` au lieu de renvoyer 404."""

    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as error:
            if error.status_code != 404:
                raise
            return await super().get_response("index.html", scope)


def is_web_app_available(directory: str) -> bool:
    """L'export web a-t-il été construit ? Son absence est un cas normal."""
    return (Path(directory) / "index.html").is_file()


def mount_web_app(app: FastAPI, directory: str) -> bool:
    if not is_web_app_available(directory):
        return False

    app.mount("/", SinglePageApp(directory=directory, html=True), name="webapp")
    return True
