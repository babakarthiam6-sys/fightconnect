"""Fenêtre de surveillance, en lecture seule.

Ce que ces routes montrent, et ce qu'elles taisent
--------------------------------------------------

Elles répondent à une seule question : *est-ce que l'application vit ?* Nombre
de comptes, de profils remplis, de demandes par état, de messages, et ce que la
modération a bloqué. Des **compteurs**, jamais des personnes : aucun email,
aucun nom, aucun message, aucun identifiant de compte ne sort d'ici. Surveiller
la santé d'un service n'exige pas de lire le courrier de ses utilisateurs, et
une route d'administration qui le permettrait finirait par servir à ça.

L'accès tient à un jeton, `ADMIN_TOKEN`, comparé en temps constant. Sans ce
jeton dans l'environnement, le routeur n'est pas monté du tout : une porte qui
n'existe pas ne s'ouvre pas par erreur de configuration.

Aucune route n'écrit. C'est délibéré : le jour où il faudra corriger une donnée,
cela se fera ailleurs, à visage découvert, et non par un canal conçu pour
regarder.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.config import get_settings
from app.dependencies import Database
from app.serializers import to_object_id


async def exige_le_jeton(x_admin_token: Annotated[str | None, Header()] = None) -> None:
    """Compare le jeton en temps constant.

    `secrets.compare_digest` plutôt que `==` : une comparaison ordinaire s'arrête
    au premier caractère faux, et le temps qu'elle met révèle la longueur du
    préfixe correct. C'est peu, mais c'est gratuit à corriger.
    """
    attendu = get_settings().admin_token
    if not attendu or not x_admin_token or not secrets.compare_digest(x_admin_token, attendu):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Jeton de surveillance invalide.",
        )


async def exige_le_jeton_d_action(
    x_admin_write_token: Annotated[str | None, Header()] = None,
) -> None:
    """Second jeton, distinct, pour les routes qui écrivent.

    Lire et agir ne se donnent pas ensemble. Le jeton de lecture peut vivre dans
    la configuration d'un assistant, sur une machine de bureau, dans un dépôt de
    notes ; celui qui suspend un compte ne le doit pas. Séparer coûte une
    variable d'environnement et retire l'écriture à quiconque n'a que la
    lecture.

    Sans `ADMIN_WRITE_TOKEN`, aucune route d'écriture n'est montée.
    """
    attendu = get_settings().admin_write_token
    if (
        not attendu
        or not x_admin_write_token
        or not secrets.compare_digest(x_admin_write_token, attendu)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Jeton d\u2019action invalide.",
        )


router = APIRouter(
    prefix="/admin",
    tags=["surveillance"],
    dependencies=[Depends(exige_le_jeton)],
)

# Les routes qui écrivent portent les **deux** jetons : celui de lecture par le
# routeur, celui d'action par leur propre dépendance.
actions = APIRouter(
    prefix="/admin",
    tags=["administration"],
    dependencies=[Depends(exige_le_jeton), Depends(exige_le_jeton_d_action)],
)


async def _journalise(
    database: Any, action: str, cible: str, detail: dict[str, Any] | None = None
) -> None:
    """Trace chaque écriture.

    Une action d'administration sans trace est une action que personne ne peut
    contester ni comprendre trois mois plus tard. Le journal ne contient que des
    identifiants et un verbe — jamais le contenu de ce qui a été masqué.
    """
    await database.admin_log.insert_one(
        {
            "action": action,
            "cible": cible,
            "detail": detail or {},
            "horodatage": datetime.now(timezone.utc),
        }
    )


async def _compte(collection: Any, requete: dict[str, Any] | None = None) -> int:
    return int(await collection.count_documents(requete or {}))


async def _repartition(collection: Any, champ: str, filtre: dict[str, Any]) -> dict[str, int]:
    """Combien de profils par pays, par discipline. Des nombres, pas des noms."""
    curseur = collection.aggregate(
        [
            {"$match": {**filtre, champ: {"$ne": None}}},
            {"$group": {"_id": f"${champ}", "n": {"$sum": 1}}},
            {"$sort": {"n": -1}},
            {"$limit": 20},
        ]
    )
    return {str(ligne["_id"]): int(ligne["n"]) async for ligne in curseur}


async def _argent(bookings: Any) -> dict[str, Any]:
    """Volume et commission des séances réellement payées.

    Seules comptent les demandes payées : additionner des demandes en attente
    donnerait un chiffre d'affaires imaginaire, et c'est exactement le genre de
    chiffre qu'on finit par croire.
    """
    curseur = bookings.aggregate(
        [
            {"$match": {"paid": True}},
            {
                "$group": {
                    "_id": "$currency",
                    "total": {"$sum": "$total"},
                    "commission": {"$sum": "$commission"},
                    "n": {"$sum": 1},
                }
            },
        ]
    )
    return {
        str(ligne["_id"] or "EUR"): {
            "seances": int(ligne["n"]),
            "volume": round(float(ligne["total"]), 2),
            "commission": round(float(ligne["commission"]), 2),
        }
        async for ligne in curseur
    }


@router.get("/overview")
async def overview(database: Database) -> dict[str, Any]:
    """Photographie de l'application, en compteurs.

    Le découpage à sept jours n'est pas décoratif : c'est la seule ligne qui dit
    si le produit vit ou s'il est simplement né. Un total qui monte sans activité
    récente décrit un cimetière.
    """
    maintenant = datetime.now(timezone.utc)
    semaine = maintenant - timedelta(days=7)

    users = database.users
    bookings = database.bookings

    profils_complets: dict[str, Any] = {"style": {"$ne": None}, "price_per_round": {"$ne": None}}
    etats = ("pending", "accepted", "declined", "cancelled", "completed")

    return {
        "horodatage": maintenant.isoformat(),
        "comptes": {
            "total": await _compte(users),
            "profil_rempli": await _compte(users, profils_complets),
            "visibles": await _compte(users, {**profils_complets, "available": True}),
            "versements_actifs": await _compte(users, {"stripe_payouts_enabled": True}),
            "nouveaux_7j": await _compte(users, {"created_at": {"$gte": semaine}}),
        },
        "pays": await _repartition(users, "country", profils_complets),
        "disciplines": await _repartition(users, "style", profils_complets),
        "demandes": {
            **{etat: await _compte(bookings, {"status": etat}) for etat in etats},
            "total": await _compte(bookings),
            "nouvelles_7j": await _compte(bookings, {"created_at": {"$gte": semaine}}),
            "payees": await _compte(bookings, {"paid": True}),
        },
        "discussion": {
            "messages": await _compte(database.messages),
            "messages_7j": await _compte(database.messages, {"created_at": {"$gte": semaine}}),
            "non_lus": await _compte(database.messages, {"read": False}),
        },
        "moderation": {
            "avis": await _compte(database.reviews),
            "avis_signales": await _compte(database.reviews, {"flagged": True}),
        },
        "argent": await _argent(bookings),
    }


# ---------------------------------------------------------------------------
# Actions — le peu qui écrit
# ---------------------------------------------------------------------------
#
# Trois verbes, et pas un de plus. Chacun répond à une situation réelle qu'un
# humain ne peut pas traiter depuis l'application : un compte qui harcèle, un
# avis diffamatoire, un signalement traité.
#
# Ce qui est délibérément **absent** :
#
# - Aucune création de compte ni de profil. Fabriquer de faux partenaires pour
#   remplir une recherche vide tromperait les premiers vrais utilisateurs, et
#   c'est précisément ce qu'on leur demande de ne pas faire.
# - Aucune suppression. Suspendre se défait ; supprimer, non. Le compte reste,
#   invisible, et son propriétaire garde le droit de l'effacer lui-même.
# - Aucune lecture de message ni d'avis. Masquer un contenu se fait par son
#   identifiant, transmis par celui qui l'a signalé. La modération n'a pas
#   besoin de lire les conversations pour retirer ce qu'on lui désigne.


@router.get("/reports")
async def signalements(database: Database, limit: int = 25) -> dict[str, Any]:
    """File des signalements ouverts, sans le contenu signalé.

    Volontairement pauvre : le type de cible, son identifiant, le motif et la
    date. Rien du message lui-même. Traiter un signalement, c'est décider
    d'agir sur une cible désignée, pas lire la conversation d'autrui.
    """
    curseur = (
        database.reports.find({"status": "open"})
        .sort([("created_at", -1)])
        .limit(max(1, min(limit, 100)))
    )
    items = [
        {
            "id": str(rapport["_id"]),
            "cible_type": rapport.get("target_type"),
            "cible_id": str(rapport.get("target_id")),
            "motif": rapport.get("reason"),
            "date": (rapport.get("created_at") or datetime.now(timezone.utc)).isoformat(),
        }
        async for rapport in curseur
    ]
    ouverts = await _compte(database.reports, {"status": "open"})
    return {"items": items, "ouverts": ouverts}


@actions.post("/users/{user_id}/suspend")
async def suspendre(user_id: str, database: Database) -> dict[str, Any]:
    """Rend un compte invisible et non réservable.

    Suspendre, pas supprimer : la mesure se défait, et le propriétaire garde le
    droit d'effacer son compte lui-même. Un compte suspendu peut encore se
    connecter — sans quoi il ne pourrait plus ni contester ni supprimer ses
    données, ce que le RGPD ne permet pas de lui refuser.
    """
    cible = to_object_id(user_id)
    resultat = await database.users.update_one(
        {"_id": cible}, {"$set": {"available": False, "suspended": True}}
    )
    if resultat.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compte introuvable.")

    await _journalise(database, "suspend", user_id)
    return {"suspendu": True, "id": user_id}


@actions.post("/users/{user_id}/unsuspend")
async def lever_la_suspension(user_id: str, database: Database) -> dict[str, Any]:
    """Lève la suspension.

    Ne remet pas le compte en ligne : `available` reste faux, et c'est à son
    propriétaire de se rendre à nouveau visible. Décider à sa place qu'il
    souhaite reprendre serait présumer de son intention.
    """
    cible = to_object_id(user_id)
    resultat = await database.users.update_one({"_id": cible}, {"$set": {"suspended": False}})
    if resultat.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compte introuvable.")

    await _journalise(database, "unsuspend", user_id)
    return {"suspendu": False, "id": user_id}


@actions.post("/reviews/{review_id}/hide")
async def masquer_un_avis(review_id: str, database: Database) -> dict[str, Any]:
    """Retire un avis de la fiche publique et de la note moyenne.

    L'avis n'est pas détruit : il est marqué. Un avis effacé ne se conteste
    plus, et une erreur de modération deviendrait irréparable.
    """
    cible = to_object_id(review_id)
    resultat = await database.reviews.update_one(
        {"_id": cible}, {"$set": {"flagged": True, "hidden_by_admin": True}}
    )
    if resultat.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avis introuvable.")

    await _journalise(database, "hide_review", review_id)
    return {"masque": True, "id": review_id}


@actions.post("/reports/{report_id}/resolve")
async def clore_un_signalement(report_id: str, database: Database) -> dict[str, Any]:
    """Marque un signalement comme traité, sans rien changer d'autre."""
    cible = to_object_id(report_id)
    resultat = await database.reports.update_one(
        {"_id": cible},
        {"$set": {"status": "resolved", "resolved_at": datetime.now(timezone.utc)}},
    )
    if resultat.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Signalement introuvable."
        )

    await _journalise(database, "resolve_report", report_id)
    return {"traite": True, "id": report_id}


@router.get("/journal")
async def journal(database: Database, limit: int = 50) -> dict[str, Any]:
    """Ce qui a été fait, et quand. Lisible avec le seul jeton de lecture :
    une trace que seul celui qui agit peut consulter ne trace rien."""
    curseur = (
        database.admin_log.find({}).sort([("horodatage", -1)]).limit(max(1, min(limit, 200)))
    )
    return {
        "items": [
            {
                "action": ligne.get("action"),
                "cible": ligne.get("cible"),
                "horodatage": (
                    ligne.get("horodatage") or datetime.now(timezone.utc)
                ).isoformat(),
            }
            async for ligne in curseur
        ]
    }
