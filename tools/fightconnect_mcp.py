#!/usr/bin/env python3
"""Serveur MCP FightConnect — regarder, et le peu qu'il faut pour agir.

À quoi ça sert
--------------

Branché à Claude Code ou à l'application Claude, ce serveur permet à
l'assistant de suivre l'application en production sans qu'un humain ait à
copier-coller quoi que ce soit : santé, compteurs, routes montées, file des
signalements, journal des actions.

Deux jetons, deux niveaux
--------------------------

`FIGHTCONNECT_ADMIN_TOKEN` ouvre la **lecture**. Les compteurs ne contiennent
aucune donnée personnelle — c'est le serveur lui-même qui le garantit, et un
test le vérifie côté API.

`FIGHTCONNECT_ADMIN_WRITE_TOKEN` ouvre les quatre **actions** : suspendre un
compte, lever la suspension, masquer un avis, clore un signalement. Sans lui,
ces outils ne sont même pas proposés. Séparer les deux n'est pas de la
cérémonie : le jeton de lecture finit dans un fichier de configuration, sur une
machine de bureau, dans des notes ; celui qui suspend un compte ne le doit pas.

Ce qui reste impossible
------------------------

Créer un compte ou un faux profil — remplir une recherche vide de partenaires
inventés tromperait les premiers vrais utilisateurs. Supprimer quoi que ce soit
— suspendre se défait, supprimer non. Lire un message ou un avis — la
modération agit sur une cible désignée, elle n'ouvre pas les conversations.
Chaque action laisse une trace, lisible avec le seul jeton de lecture.

Comment le brancher
-------------------

Dans `~/.claude.json` (ou via `claude mcp add`) :

    {
      "mcpServers": {
        "fightconnect": {
          "command": "python3",
          "args": ["/chemin/vers/tools/fightconnect_mcp.py"],
          "env": {
            "FIGHTCONNECT_URL": "https://fightconnect-production.up.railway.app",
            "FIGHTCONNECT_ADMIN_TOKEN": "le jeton défini dans Railway"
          }
        }
      }
    }

Aucune dépendance : le protocole MCP tient sur stdin/stdout en JSON-RPC, et
`urllib` suffit pour les appels. Une dépendance de moins est une dépendance qui
ne casse pas le jour où il faut s'en servir.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any

BASE = os.environ.get("FIGHTCONNECT_URL", "https://fightconnect-production.up.railway.app")
JETON = os.environ.get("FIGHTCONNECT_ADMIN_TOKEN", "")
# Jeton distinct pour agir. Absent, le serveur ne propose que la lecture : les
# outils d'action ne sont même pas listés, plutôt que d'échouer à l'usage.
JETON_ACTION = os.environ.get("FIGHTCONNECT_ADMIN_WRITE_TOKEN", "")
TIMEOUT = 30

OUTILS_LECTURE = [
    {
        "name": "sante",
        "description": (
            "État du serveur FightConnect : base de données joignable, Stripe et "
            "modération configurés ou non, application web servie. Ne demande aucun "
            "jeton. À appeler en premier quand quelque chose semble cassé."
        ),
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "apercu",
        "description": (
            "Compteurs de l'application : comptes, profils remplis, partenaires "
            "visibles, demandes par état, messages, avis signalés, et volume des "
            "séances payées par devise. Uniquement des nombres — aucune donnée "
            "personnelle. Exige FIGHTCONNECT_ADMIN_TOKEN."
        ),
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "routes",
        "description": (
            "Liste les routes réellement montées en production, lues depuis le "
            "schéma OpenAPI du serveur. Utile pour vérifier qu'un déploiement a "
            "bien pris, ou qu'une route existe avant de conclure qu'elle est "
            "cassée."
        ),
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "signalements",
        "description": (
            "File des signalements ouverts : type de cible, identifiant, motif, "
            "date. Ne contient aucun contenu signalé ni aucune identité — traiter "
            "un signalement, c'est agir sur une cible désignée, pas lire la "
            "conversation d'autrui."
        ),
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "journal",
        "description": (
            "Historique des actions d'administration déjà effectuées : quoi, sur "
            "quelle cible, quand. À consulter avant d'agir, pour ne pas refaire "
            "ce qui a déjà été fait."
        ),
        "inputSchema": {"type": "object", "properties": {}},
    },
]

# Ces quatre-là écrivent. Elles n'apparaissent que si le jeton d'action existe.
OUTILS_ACTION = [
    {
        "name": "suspendre_compte",
        "description": (
            "Rend un compte invisible dans la recherche et non réservable. "
            "Réversible. Le compte peut encore se connecter — pour contester et "
            "pour supprimer ses données, ce qu'on ne peut pas lui refuser. "
            "À utiliser sur un compte signalé pour harcèlement ou arnaque."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {"user_id": {"type": "string", "description": "Identifiant du compte"}},
            "required": ["user_id"],
        },
    },
    {
        "name": "lever_suspension",
        "description": (
            "Annule une suspension. Ne remet pas le compte en ligne : c'est à "
            "son propriétaire de se rendre à nouveau visible."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {"user_id": {"type": "string"}},
            "required": ["user_id"],
        },
    },
    {
        "name": "masquer_avis",
        "description": (
            "Retire un avis de la fiche publique et de la note moyenne. L'avis "
            "n'est pas détruit, il est marqué : une erreur de modération doit "
            "rester réparable."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {"review_id": {"type": "string"}},
            "required": ["review_id"],
        },
    },
    {
        "name": "clore_signalement",
        "description": "Marque un signalement comme traité. Ne change rien d'autre.",
        "inputSchema": {
            "type": "object",
            "properties": {"report_id": {"type": "string"}},
            "required": ["report_id"],
        },
    },
]


def _appel(chemin: str, avec_jeton: bool = False) -> Any:
    url = f"{BASE.rstrip('/')}{chemin}"
    requete = urllib.request.Request(url, method="GET")
    requete.add_header("Accept", "application/json")
    if avec_jeton:
        if not JETON:
            return {
                "erreur": "FIGHTCONNECT_ADMIN_TOKEN n'est pas défini.",
                "remede": (
                    "Définir ADMIN_TOKEN dans les variables de Railway, puis la même "
                    "valeur dans FIGHTCONNECT_ADMIN_TOKEN côté client MCP."
                ),
            }
        requete.add_header("X-Admin-Token", JETON)

    try:
        with urllib.request.urlopen(requete, timeout=TIMEOUT) as reponse:
            return json.loads(reponse.read().decode())
    except urllib.error.HTTPError as erreur:
        corps = erreur.read().decode()[:400]
        return {"erreur": f"HTTP {erreur.code}", "reponse": corps}
    except Exception as erreur:  # réseau coupé, DNS, TLS…
        return {"erreur": f"{type(erreur).__name__}: {erreur}"}


def _poste(chemin: str) -> Any:
    """Appel qui écrit : les deux jetons sont exigés ensemble."""
    if not JETON or not JETON_ACTION:
        return {
            "erreur": "Jeton d'action manquant.",
            "remede": (
                "Définir ADMIN_WRITE_TOKEN dans Railway, puis la même valeur dans "
                "FIGHTCONNECT_ADMIN_WRITE_TOKEN côté client MCP. Le jeton de lecture "
                "seul ne permet pas d'agir, c'est délibéré."
            ),
        }

    requete = urllib.request.Request(f"{BASE.rstrip('/')}{chemin}", data=b"", method="POST")
    requete.add_header("Accept", "application/json")
    requete.add_header("X-Admin-Token", JETON)
    requete.add_header("X-Admin-Write-Token", JETON_ACTION)
    try:
        with urllib.request.urlopen(requete, timeout=TIMEOUT) as reponse:
            return json.loads(reponse.read().decode())
    except urllib.error.HTTPError as erreur:
        return {"erreur": f"HTTP {erreur.code}", "reponse": erreur.read().decode()[:400]}
    except Exception as erreur:
        return {"erreur": f"{type(erreur).__name__}: {erreur}"}


def outil_sante() -> Any:
    return _appel("/health")


def outil_apercu() -> Any:
    return _appel("/api/v1/admin/overview", avec_jeton=True)


def outil_routes() -> Any:
    schema = _appel("/openapi.json")
    if not isinstance(schema, dict) or "paths" not in schema:
        return schema
    return {
        "titre": schema.get("info", {}).get("title"),
        "routes": sorted(
            f"{','.join(m.upper() for m in methodes)} {chemin}"
            for chemin, methodes in schema["paths"].items()
        ),
    }


EXECUTEURS = {
    "sante": lambda _: outil_sante(),
    "apercu": lambda _: outil_apercu(),
    "routes": lambda _: outil_routes(),
    "signalements": lambda _: _appel("/api/v1/admin/reports", avec_jeton=True),
    "journal": lambda _: _appel("/api/v1/admin/journal", avec_jeton=True),
    "suspendre_compte": lambda a: _poste(f"/api/v1/admin/users/{a['user_id']}/suspend"),
    "lever_suspension": lambda a: _poste(f"/api/v1/admin/users/{a['user_id']}/unsuspend"),
    "masquer_avis": lambda a: _poste(f"/api/v1/admin/reviews/{a['review_id']}/hide"),
    "clore_signalement": lambda a: _poste(f"/api/v1/admin/reports/{a['report_id']}/resolve"),
}


def outils_disponibles() -> list[dict[str, Any]]:
    """Les outils d'action ne sont listés que si le jeton existe.

    Les annoncer sans pouvoir les exécuter ferait perdre un aller-retour à
    chaque tentative, et donnerait l'impression d'une panne là où il n'y a
    qu'une configuration absente.
    """
    return OUTILS_LECTURE + (OUTILS_ACTION if JETON_ACTION else [])


def _reponse(identifiant: Any, resultat: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": identifiant, "result": resultat}


def traite(message: dict[str, Any]) -> dict[str, Any] | None:
    """Traite un message JSON-RPC. `None` pour une notification, sans réponse."""
    methode = message.get("method")
    identifiant = message.get("id")

    if methode == "initialize":
        return _reponse(
            identifiant,
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "fightconnect", "version": "1.0.0"},
            },
        )

    if methode == "tools/list":
        return _reponse(identifiant, {"tools": outils_disponibles()})

    if methode == "tools/call":
        params = message.get("params", {})
        nom = params.get("name", "")
        arguments = params.get("arguments") or {}
        executeur = EXECUTEURS.get(nom)
        if executeur is None:
            return {
                "jsonrpc": "2.0",
                "id": identifiant,
                "error": {"code": -32602, "message": f"Outil inconnu : {nom}"},
            }
        try:
            resultat = executeur(arguments)
        except KeyError as manquant:
            resultat = {"erreur": f"Argument manquant : {manquant}"}
        return _reponse(
            identifiant,
            {"content": [{"type": "text", "text": json.dumps(resultat, ensure_ascii=False, indent=2)}]},
        )

    # Les notifications n'ont pas d'identifiant et n'attendent pas de réponse.
    if identifiant is None:
        return None

    return {
        "jsonrpc": "2.0",
        "id": identifiant,
        "error": {"code": -32601, "message": f"Méthode inconnue : {methode}"},
    }


def main() -> None:
    for ligne in sys.stdin:
        ligne = ligne.strip()
        if not ligne:
            continue
        try:
            message = json.loads(ligne)
        except json.JSONDecodeError:
            continue

        reponse = traite(message)
        if reponse is not None:
            sys.stdout.write(json.dumps(reponse, ensure_ascii=False) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
