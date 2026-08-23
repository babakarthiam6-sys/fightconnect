#!/usr/bin/env python3
"""Serveur MCP FightConnect — une fenêtre en lecture seule sur l'application.

À quoi ça sert
--------------

Branché à Claude Code ou à l'application Claude, ce serveur donne à l'assistant
trois outils pour regarder l'application en production sans qu'un humain ait à
copier-coller quoi que ce soit : sa santé, ses compteurs, ses routes.

Ce qu'il ne fait pas
--------------------

Il n'écrit rien, nulle part. Aucun outil ne crée, ne modifie ni ne supprime.
Les compteurs qu'il rapporte ne contiennent aucune donnée personnelle — c'est le
serveur lui-même qui l'garantit, et un test le vérifie côté API.

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
TIMEOUT = 30

OUTILS = [
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


EXECUTEURS = {"sante": outil_sante, "apercu": outil_apercu, "routes": outil_routes}


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
        return _reponse(identifiant, {"tools": OUTILS})

    if methode == "tools/call":
        nom = message.get("params", {}).get("name", "")
        executeur = EXECUTEURS.get(nom)
        if executeur is None:
            return {
                "jsonrpc": "2.0",
                "id": identifiant,
                "error": {"code": -32602, "message": f"Outil inconnu : {nom}"},
            }
        resultat = executeur()
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
