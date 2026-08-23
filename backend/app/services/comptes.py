"""Suppression d'un compte.

Pourquoi ce fichier existe
--------------------------

Apple refuse depuis 2022 toute application qui permet de créer un compte sans
permettre de le supprimer, depuis l'application elle-même, sans écrire à
personne (règle 5.1.1(v)). Google exige la même chose, doublée d'une adresse web
accessible sans installer l'application. Ne pas l'avoir n'est pas un manque de
finition : c'est un rejet à la première soumission, et un retrait si la règle
change après coup.

Ce qui est effacé, et ce qui ne peut pas l'être
------------------------------------------------

Le compte disparaît : identité, email, mot de passe, jeton d'appareil, profil
sportif. Ce qui appartient **aussi à quelqu'un d'autre** ne disparaît pas, il
est rendu anonyme :

- Les **messages** restent dans le fil de l'autre personne. Les effacer
  trouerait une conversation dont elle est copropriétaire, et effacerait la
  preuve d'un abus qu'elle vient peut-être de signaler.
- Les **avis** restent attachés au partenaire noté. Un partenaire qui accumule
  de mauvais avis pourrait sinon les faire disparaître en supprimant les comptes
  de ceux qui les ont écrits.
- Les **demandes passées** restent dans l'historique de l'autre partie, sans
  quoi son propre historique de séances deviendrait faux.

Dans les trois cas, le lien vers la personne est coupé : plus de nom, plus
d'email, plus d'identifiant réutilisable. C'est la ligne que trace le RGPD entre
effacement et anonymisation, et elle tombe au bon endroit ici.

Ce qui bloque la suppression
-----------------------------

Une séance payée et pas encore passée. La supprimer laisserait l'argent d'un
tiers dans une transaction sans contrepartie. La demande doit d'abord être
annulée — donc remboursée — par son écran habituel.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.i18n import t

# Ce qui remplace un nom effacé. Volontairement lisible : « Utilisateur
# supprimé » dit ce qui s'est passé, là où une chaîne vide laisserait croire à
# un bug d'affichage.
ANONYME_PRENOM = "Compte"
ANONYME_NOM = "supprimé"


async def demandes_bloquantes(
    database: AsyncIOMotorDatabase, user_id: ObjectId
) -> list[dict[str, Any]]:
    """Séances payées, à venir, et encore vivantes.

    Ce sont les seules qui empêchent la suppression : l'argent est déjà chez
    Stripe et la séance n'a pas eu lieu.
    """
    curseur = database.bookings.find(
        {
            "$or": [{"requester_id": user_id}, {"partner_id": user_id}],
            "status": {"$in": ["pending", "accepted"]},
            "paid": True,
            "scheduled_at": {"$gt": datetime.now(timezone.utc)},
        }
    )
    return [document async for document in curseur]


async def supprimer_le_compte(
    database: AsyncIOMotorDatabase, user: dict[str, Any]
) -> dict[str, Any]:
    """Efface le compte et anonymise ce qui appartient aussi à d'autres.

    L'ordre compte. Les demandes en cours sont annulées **avant** que le compte
    ne disparaisse : une demande dont l'auteur n'existe plus resterait en
    attente pour toujours dans la liste de l'autre personne.
    """
    user_id: ObjectId = user["_id"]

    bloquantes = await demandes_bloquantes(database, user_id)
    if bloquantes:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=t("compte.suppression_bloquee", n=len(bloquantes)),
        )

    maintenant = datetime.now(timezone.utc)

    # 1. Les demandes encore vivantes tombent : personne ne doit rester en
    #    attente d'une réponse qui ne viendra jamais.
    annulees = await database.bookings.update_many(
        {
            "$or": [{"requester_id": user_id}, {"partner_id": user_id}],
            "status": {"$in": ["pending", "accepted"]},
        },
        {"$set": {"status": "cancelled", "cancelled_at": maintenant, "cancelled_by_deletion": True}},
    )

    # 2. Les messages restent dans le fil de l'autre, sans leur auteur.
    messages = await database.messages.update_many(
        {"sender_id": user_id},
        {"$set": {"sender_deleted": True}},
    )

    # 3. Les avis restent attachés au partenaire noté, sans leur auteur.
    avis = await database.reviews.update_many(
        {"author_id": user_id},
        {"$set": {"author_deleted": True}},
    )

    # 4. Le compte lui-même disparaît. Aucun `$set` : le document est retiré,
    #    et avec lui l'email, le mot de passe et le jeton d'appareil.
    await database.users.delete_one({"_id": user_id})

    # 5. Les blocages posés par ce compte n'ont plus d'objet.
    await database.blocks.delete_many({"$or": [{"blocker_id": user_id}, {"blocked_id": user_id}]})

    return {
        "supprime": True,
        "demandes_annulees": int(annulees.modified_count),
        "messages_anonymises": int(messages.modified_count),
        "avis_anonymises": int(avis.modified_count),
    }
