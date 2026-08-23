"""Messages de l'API, en français et en anglais.

Le serveur répond dans la langue demandée par l'en-tête `Accept-Language`, et
retombe sur le français quand il ne reconnaît rien. La langue voyage dans une
variable de contexte plutôt que d'être passée à chaque fonction : un message
d'erreur peut naître au fond d'un service, à cinq appels du routeur, et lui
faire traverser cette distance en paramètre alourdirait toutes les signatures
pour un seul usage.
"""

from __future__ import annotations

from contextvars import ContextVar
from typing import Any

LANGUE_PAR_DEFAUT = "fr"
LANGUES = ("fr", "en")

_langue: ContextVar[str] = ContextVar("langue", default=LANGUE_PAR_DEFAUT)

MESSAGES: dict[str, dict[str, str]] = {
    # Comptes
    "compte.email_pris": {
        "fr": "Un compte existe déjà avec cet email.",
        "en": "An account already exists with this email.",
    },
    "compte.identifiants_invalides": {
        "fr": "Email ou mot de passe incorrect.",
        "en": "Incorrect email or password.",
    },
    "compte.decharge_obligatoire": {
        "fr": "La décharge de responsabilité doit être acceptée.",
        "en": "You must accept the liability waiver.",
    },
    "compte.trop_de_tentatives": {
        "fr": "Trop de tentatives. Réessayez dans quelques minutes.",
        "en": "Too many attempts. Try again in a few minutes.",
    },
    "compte.introuvable": {
        "fr": "Utilisateur introuvable.",
        "en": "User not found.",
    },
    "compte.suppression_bloquee": {
        "fr": (
            "{n} séance(s) payée(s) et à venir empêchent la suppression. "
            "Annulez-les d\u2019abord : vous serez remboursé."
        ),
        "en": (
            "{n} paid upcoming session(s) prevent deletion. "
            "Cancel them first: you will be refunded."
        ),
    },
    "compte.mot_de_passe_requis": {
        "fr": "Confirmez votre mot de passe pour supprimer votre compte.",
        "en": "Confirm your password to delete your account.",
    },
    "compte.profil_incomplet": {
        "fr": "Renseignez votre discipline et votre tarif avant de vous rendre disponible.",
        "en": "Set your discipline and your rate before making yourself available.",
    },
    "compte.valeur_inconnue": {
        "fr": "Valeur inconnue pour {champ} : {valeur}.",
        "en": "Unknown value for {champ}: {valeur}.",
    },
    "compte.pays_inconnu": {
        "fr": "Pays inconnu : {valeur}.",
        "en": "Unknown country: {valeur}.",
    },
    "compte.devise_inconnue": {
        "fr": "Devise non prise en charge : {valeur}.",
        "en": "Unsupported currency: {valeur}.",
    },
    "compte.tarif_trop_eleve": {
        "fr": "Tarif trop élevé : au plus {plafond} {devise} par round.",
        "en": "Rate too high: at most {plafond} {devise} per round.",
    },
    # Sécurité
    "securite.cible_inconnue": {
        "fr": "Type de signalement inconnu : {valeur}.",
        "en": "Unknown report target: {valeur}.",
    },
    "securite.motif_inconnu": {
        "fr": "Motif de signalement inconnu : {valeur}.",
        "en": "Unknown report reason: {valeur}.",
    },
    "securite.pas_soi_meme": {
        "fr": "On ne peut pas se signaler ni se bloquer soi-même.",
        "en": "You cannot report or block yourself.",
    },
    "securite.bloque": {
        "fr": "Vous ne pouvez pas contacter cette personne.",
        "en": "You cannot contact this person.",
    },
    # Recherche
    "recherche.filtre_inconnu": {
        "fr": "{label} inconnu : {valeur}.",
        "en": "Unknown {label}: {valeur}.",
    },
    "recherche.filtre.sport": {"fr": "Sport", "en": "Discipline"},
    "recherche.filtre.niveau": {"fr": "Niveau", "en": "Level"},
    "recherche.filtre.poids": {"fr": "Catégorie de poids", "en": "Weight class"},
    "partenaire.introuvable": {
        "fr": "Partenaire introuvable.",
        "en": "Partner not found.",
    },
    # Demandes
    "demande.introuvable": {"fr": "Demande introuvable.", "en": "Request not found."},
    "demande.pas_la_votre": {
        "fr": "Cette demande ne vous appartient pas.",
        "en": "This request is not yours.",
    },
    "demande.pas_pour_vous": {
        "fr": "Cette demande ne vous est pas adressée.",
        "en": "This request was not sent to you.",
    },
    "demande.pas_concerne": {
        "fr": "Cette demande ne vous concerne pas.",
        "en": "This request does not concern you.",
    },
    "demande.deja_traitee": {
        "fr": "Cette demande a déjà été traitée.",
        "en": "This request has already been handled.",
    },
    "demande.annulation_impossible": {
        "fr": "Cette demande ne peut plus être annulée.",
        "en": "This request can no longer be cancelled.",
    },
    "demande.soi_meme": {
        "fr": "On ne peut pas se réserver soi-même.",
        "en": "You cannot book yourself.",
    },
    "demande.partenaire_indisponible": {
        "fr": "Ce partenaire n’est pas disponible en ce moment.",
        "en": "This partner is not available right now.",
    },
    "demande.tarif_absent": {
        "fr": "Ce partenaire n’a pas encore fixé son tarif.",
        "en": "This partner has not set a rate yet.",
    },
    "demande.date_invalide": {
        "fr": "Date invalide : format ISO 8601 attendu.",
        "en": "Invalid date: ISO 8601 format expected.",
    },
    "demande.date_passee": {
        "fr": "La séance doit être programmée dans le futur.",
        "en": "The session must be scheduled in the future.",
    },
    "demande.cloture_impossible": {
        "fr": "Seule une demande acceptée peut être clôturée.",
        "en": "Only an accepted request can be closed.",
    },
    "demande.pas_encore_passee": {
        "fr": "La séance n’a pas encore eu lieu.",
        "en": "The session has not taken place yet.",
    },
    # Paiements
    "paiement.stripe_absent": {
        "fr": "Le paiement est indisponible : STRIPE_SECRET_KEY n’est pas configurée.",
        "en": "Payment is unavailable: STRIPE_SECRET_KEY is not configured.",
    },
    "paiement.webhook_absent": {
        "fr": "STRIPE_WEBHOOK_SECRET n’est pas configuré.",
        "en": "STRIPE_WEBHOOK_SECRET is not configured.",
    },
    "paiement.signature_invalide": {
        "fr": "Signature Stripe invalide.",
        "en": "Invalid Stripe signature.",
    },
    "paiement.deja_paye": {
        "fr": "Cette séance est déjà payée.",
        "en": "This session is already paid.",
    },
    "paiement.gratuite": {
        "fr": "Cette séance est gratuite.",
        "en": "This session is free.",
    },
    "paiement.pas_acceptee": {
        "fr": "Le partenaire n’a pas encore accepté cette demande.",
        "en": "The partner has not accepted this request yet.",
    },
    "paiement.versements_absents": {
        "fr": (
            "Ce partenaire n’a pas encore configuré ses versements. "
            "La séance n’est pas encore payable."
        ),
        "en": (
            "This partner has not set up payouts yet. "
            "The session cannot be paid for."
        ),
    },
    "paiement.stripe_refuse_paiement": {
        "fr": "Stripe a refusé la création du paiement : {raison}",
        "en": "Stripe refused to create the payment: {raison}",
    },
    "paiement.stripe_refuse_compte": {
        "fr": "Stripe a refusé la création du compte : {raison}",
        "en": "Stripe refused to create the account: {raison}",
    },
    "paiement.stripe_refuse_lien": {
        "fr": "Stripe a refusé la création du lien : {raison}",
        "en": "Stripe refused to create the link: {raison}",
    },
    "paiement.stripe_refuse_remboursement": {
        "fr": "Stripe a refusé le remboursement : {raison}",
        "en": "Stripe refused the refund: {raison}",
    },
    # Avis et discussion
    "avis.trop_tot": {
        "fr": "Attendez que la séance ait eu lieu pour laisser un avis.",
        "en": "Wait until the session has taken place to leave a review.",
    },
    "avis.pas_l_auteur": {
        "fr": "Seule la personne qui a réservé peut laisser un avis.",
        "en": "Only the person who booked can leave a review.",
    },
    "avis.deja_donne": {
        "fr": "Vous avez déjà laissé un avis.",
        "en": "You have already left a review.",
    },
    "discussion.interlocuteur_introuvable": {
        "fr": "Interlocuteur introuvable.",
        "en": "Recipient not found.",
    },
    "discussion.signale": {
        "fr": "Ce message n’a pas été envoyé : il a été signalé par la modération.",
        "en": "This message was not sent: moderation flagged it.",
    },
    "discussion.contournement": {
        "fr": (
            "Les paiements passent par l’application : c’est ce qui vous protège "
            "tous les deux en cas d’annulation ou de litige."
        ),
        "en": (
            "Payments go through the app: that is what protects you both "
            "in case of a cancellation or a dispute."
        ),
    },
}


def choisir_langue(accept_language: str | None) -> str:
    """Retient la première langue connue de l'en-tête `Accept-Language`.

    L'en-tête ressemble à « fr-CH,fr;q=0.9,en;q=0.8 ». On ne trie pas par
    qualité : l'ordre d'écriture suffit en pratique, et lire « fr-CH » comme
    « fr » couvre les variantes régionales sans les énumérer.
    """
    if not accept_language:
        return LANGUE_PAR_DEFAUT
    for morceau in accept_language.split(","):
        code = morceau.split(";")[0].strip().lower()
        racine = code.split("-")[0]
        if racine in LANGUES:
            return racine
    return LANGUE_PAR_DEFAUT


def definir_langue(langue: str) -> None:
    _langue.set(langue if langue in LANGUES else LANGUE_PAR_DEFAUT)


def langue_courante() -> str:
    return _langue.get()


def t(cle: str, **parametres: Any) -> str:
    """Message traduit dans la langue de la requête en cours.

    Une clé absente se renvoie telle quelle plutôt que de lever : un texte
    d'erreur bizarre vaut mieux qu'une erreur 500 par-dessus l'erreur d'origine.
    """
    entree = MESSAGES.get(cle)
    if entree is None:
        return cle
    modele = entree.get(langue_courante()) or entree[LANGUE_PAR_DEFAUT]
    return modele.format(**parametres) if parametres else modele
