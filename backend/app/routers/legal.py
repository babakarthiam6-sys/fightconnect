"""Pages publiques exigées par les boutiques : conditions, confidentialité, suppression du compte.

Elles sont servies par l'API, hors de l'application web, pour deux raisons : le
Play Store demande une adresse lisible sans compte ni JavaScript, et ces pages
doivent rester accessibles même si l'export web n'est pas déployé.
"""

from html import escape

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

from app.config import get_settings

router = APIRouter(tags=["pages publiques"])

PRIVACY_PATH = "/confidentialite"
DELETION_PATH = "/suppression-compte"
TERMS_PATH = "/conditions"

# À changer avec le texte des conditions : la version acceptée est enregistrée
# sur chaque compte à l'inscription.
TERMS_VERSION = "2026-10-24"

_STYLE = """
  :root { color-scheme: dark; }
  body {
    margin: 0; background: #0C0C0E; color: #E8E8EA;
    font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  main { max-width: 720px; margin: 0 auto; padding: 32px 16px 64px; }
  h1 { font-size: 1.8rem; line-height: 1.2; margin: 0 0 8px; }
  h2 { font-size: 1.2rem; margin: 32px 0 8px; }
  a { color: #FF4D2E; }
  .maj { color: #9A9AA0; font-size: .9rem; }
  li { margin: 4px 0; }
"""


def _contact() -> str:
    email = get_settings().contact_email.strip()
    if not email:
        return "via la messagerie de l’application"
    safe = escape(email)
    return f'à l’adresse <a href="mailto:{safe}">{safe}</a>'


def _page(title: str, body: str) -> HTMLResponse:
    html = f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · FightConnect</title>
<style>{_STYLE}</style>
</head>
<body><main>
{body}
</main></body>
</html>"""
    return HTMLResponse(html)


@router.get(PRIVACY_PATH, response_class=HTMLResponse, include_in_schema=False)
async def privacy_policy() -> HTMLResponse:
    contact = _contact()
    return _page(
        "Politique de confidentialité",
        f"""
<h1>Politique de confidentialité</h1>
<p class="maj">Dernière mise à jour : 24 octobre 2026</p>

<p>FightConnect met en relation des personnes qui cherchent un partenaire de
sparring. Cette page explique quelles données l’application collecte, pourquoi,
avec qui elles sont partagées et comment exercer vos droits.</p>

<h2>Responsable du traitement</h2>
<p>L’éditeur de l’application FightConnect. Pour toute question sur vos données,
écrivez-nous {contact}.</p>

<h2>Données collectées</h2>
<ul>
  <li><strong>Compte</strong> : adresse email, prénom, nom, mot de passe (stocké
  uniquement sous forme chiffrée irréversible, jamais en clair), acceptation de
  la décharge de responsabilité.</li>
  <li><strong>Profil sportif</strong> : ville, présentation, discipline, niveau,
  catégorie de poids, taille, nombre de combats, années d’expérience, tarif au
  round, disponibilité et liens vers vos vidéos (YouTube, TikTok, Instagram).
  Ces informations sont visibles des autres utilisateurs dès que vous vous
  rendez disponible.</li>
  <li><strong>Demandes de sparring</strong> : date, nombre de rounds, montants,
  statut de la demande, et les avis laissés après une séance.</li>
  <li><strong>Annonces</strong> : les annonces que vous publiez (discipline, ville,
  date, niveau, poids, texte, et pour un combat les informations du combattant
  et un lien vidéo) et les réponses que vous y faites. Une annonce est visible
  de tous les utilisateurs tant qu’elle est en ligne ; une réponse n’est
  visible que de l’auteur de l’annonce. Elles sont analysées automatiquement,
  comme les messages.</li>
  <li><strong>Messages</strong> : le contenu et l’heure des messages échangés
  avec les autres utilisateurs. Ils sont analysés automatiquement pour bloquer
  les tentatives de fraude et les contenus abusifs.</li>
  <li><strong>Paiements</strong> : ils sont traités par Stripe. Vos données de
  carte bancaire sont saisies directement chez Stripe et ne transitent jamais
  par nos serveurs. Nous conservons l’identifiant du paiement, son montant, sa
  devise, son statut et la commission de la plateforme.</li>
  <li><strong>Versements</strong> : si vous êtes payé pour vos séances,
  l’identifiant de votre compte Stripe Connect et son état. Les informations
  d’identité et bancaires demandées pour ce compte sont collectées par Stripe,
  pas par FightConnect.</li>
  <li><strong>Signalements et blocages</strong> : les personnes que vous bloquez,
  et les signalements que vous faites (motif, précisions, et une copie du
  contenu signalé pour que l’équipe puisse en juger). La personne signalée ne
  sait pas qui l’a signalée ; une personne bloquée n’en est pas avertie.</li>
  <li><strong>Notifications</strong> : le jeton technique qui permet d’envoyer
  des notifications à votre téléphone.</li>
  <li><strong>Sécurité</strong> : le nombre de tentatives de connexion échouées
  par adresse email, pour freiner les attaques sur les mots de passe.</li>
</ul>
<p>L’application n’utilise ni publicité, ni traceur publicitaire, et ne revend
aucune donnée.</p>

<h2>Pourquoi nous les utilisons</h2>
<ul>
  <li>Faire fonctionner le service que vous demandez : profil, recherche,
  demandes, discussion, paiement et versements (exécution du contrat).</li>
  <li>Protéger les utilisateurs : modération des messages, des annonces et des
  avis, traitement des signalements, blocages, limitation des tentatives de
  connexion (intérêt légitime).</li>
  <li>Tenir la comptabilité des paiements (obligation légale).</li>
</ul>

<h2>Avec qui elles sont partagées</h2>
<ul>
  <li><strong>Stripe</strong>, pour les paiements, les remboursements et les
  versements aux partenaires.</li>
  <li><strong>Notre hébergeur</strong>, qui fait tourner le serveur et la base de
  données.</li>
  <li><strong>Expo</strong>, qui achemine les notifications vers votre
  téléphone.</li>
  <li><strong>OpenAI</strong>, lorsque la modération automatique est activée :
  le texte des messages, des annonces et des avis lui est transmis pour
  analyse, sans votre nom ni votre email.</li>
  <li>Les <strong>autres utilisateurs</strong> voient votre profil sportif, vos
  avis, vos annonces en ligne, et les messages et réponses que vous leur
  adressez.</li>
</ul>
<p>Certains de ces prestataires peuvent traiter des données hors de l’Union
européenne, notamment aux États-Unis. Ces transferts sont encadrés par les
garanties prévues par le RGPD (clauses contractuelles types de la Commission
européenne ou cadre de protection des données UE–États-Unis).</p>

<h2>Durée de conservation</h2>
<ul>
  <li>Votre compte, votre profil, vos annonces et vos messages : jusqu’à la
  suppression de votre compte. Une annonce sans date quitte la liste au bout
  d’un mois ; une annonce datée, à sa date.</li>
  <li>Les enregistrements de paiement : dix ans, durée imposée pour les pièces
  comptables. Le nom d’un partenaire supprimé en est retiré.</li>
  <li>Les avis que vous avez laissés à d’autres : conservés sans votre nom après
  la suppression de votre compte.</li>
</ul>

<h2>Vos droits</h2>
<p>Vous pouvez accéder à vos données, les corriger, les faire supprimer, en
demander une copie, vous opposer à un traitement ou en demander la limitation.
La plupart des corrections se font directement depuis l’onglet Profil. Pour le
reste, écrivez-nous {contact}. Vous pouvez aussi saisir l’autorité de protection
des données de votre pays (la CNIL en France, l’AEPD en Espagne).</p>

<h2>Conditions d’utilisation</h2>
<p>Les règles de comportement et de contenu sont décrites dans les
<a href="{TERMS_PATH}">conditions d’utilisation</a>.</p>

<h2>Supprimer votre compte</h2>
<p>La marche à suivre et ce qui est effacé sont décrits sur la page
<a href="{DELETION_PATH}">Supprimer votre compte</a>.</p>

<h2>Sécurité</h2>
<p>Les échanges avec le serveur sont chiffrés (HTTPS). Les mots de passe sont
hachés, et la clé secrète Stripe ne quitte jamais le serveur.</p>

<h2>Modifications</h2>
<p>En cas de changement, la date en haut de cette page est mise à jour.</p>
""",
    )


@router.get(DELETION_PATH, response_class=HTMLResponse, include_in_schema=False)
async def account_deletion() -> HTMLResponse:
    contact = _contact()
    return _page(
        "Supprimer votre compte",
        f"""
<h1>Supprimer votre compte FightConnect</h1>

<h2>Depuis l’application</h2>
<ol>
  <li>Ouvrez FightConnect et connectez-vous.</li>
  <li>Allez dans l’onglet <strong>Profil</strong>.</li>
  <li>En bas de l’écran, touchez <strong>Supprimer mon compte</strong>.</li>
  <li>Confirmez. La suppression est immédiate et définitive.</li>
</ol>

<h2>Sans l’application</h2>
<p>Écrivez-nous {contact} depuis l’adresse email de votre compte, en demandant
sa suppression. Nous la traitons dans un délai d’un mois au plus.</p>

<h2>Ce qui se passe pour vos séances</h2>
<ul>
  <li>Les demandes en attente et les séances à venir sont annulées.</li>
  <li>Une séance à venir déjà payée est remboursée intégralement, avant
  l’annulation.</li>
  <li>Un paiement commencé mais pas terminé est annulé chez Stripe.</li>
  <li>Si un paiement est en cours de traitement par la banque, la suppression
  est refusée pour l’instant : réessayez quand il est terminé. Un prélèvement
  bancaire peut rester plusieurs jours dans cet état.</li>
</ul>

<h2>Ce qui est effacé</h2>
<ul>
  <li>Votre compte : email, nom, mot de passe.</li>
  <li>Votre profil sportif et vos liens vidéo.</li>
  <li>Tous les messages que vous avez envoyés ou reçus.</li>
  <li>Vos annonces, avec les réponses qu’elles ont reçues, et vos réponses aux
  annonces des autres.</li>
  <li>Les blocages que vous avez faits ou subis, et les signalements que vous
  avez faits ou qui vous visaient.</li>
  <li>Les avis reçus en tant que partenaire.</li>
  <li>Votre jeton de notification et l’historique de vos tentatives de
  connexion.</li>
</ul>

<h2>Ce qui est conservé</h2>
<ul>
  <li>Les enregistrements de paiement, pendant dix ans : la loi impose de garder
  les pièces comptables. Votre nom en est retiré lorsque vous étiez le
  partenaire.</li>
  <li>Les avis que vous avez laissés à d’autres partenaires, sans votre nom :
  les retirer changerait la note de personnes qui n’y sont pour rien.</li>
  <li>Votre compte de versement Stripe, s’il existe : il appartient à Stripe,
  qui le conserve selon ses propres obligations. Pour le faire clôturer,
  écrivez-nous {contact}.</li>
</ul>

<p>Plus de détails dans notre
<a href="{PRIVACY_PATH}">politique de confidentialité</a>.</p>
""",
    )


@router.get(TERMS_PATH, response_class=HTMLResponse, include_in_schema=False)
async def terms_of_use() -> HTMLResponse:
    contact = _contact()
    return _page(
        "Conditions d’utilisation",
        f"""
<h1>Conditions d’utilisation</h1>
<p class="maj">Version du 24 octobre 2026</p>

<p>FightConnect met en relation des personnes qui cherchent un partenaire de
sparring ou un adversaire. En créant un compte, vous acceptez ces conditions et
la décharge de responsabilité présentée à l’inscription.</p>

<h2>Qui peut utiliser FightConnect</h2>
<ul>
  <li>Vous devez avoir <strong>18 ans ou plus</strong>.</li>
  <li>Les informations de votre profil (nom, niveau, poids, palmarès) doivent
  être exactes : votre partenaire s’y fie pour sa sécurité.</li>
  <li>Un compte est personnel. Un coach peut publier une annonce pour un élève,
  mais reste responsable de ce qu’il en dit.</li>
</ul>

<h2>Ce qui est interdit</h2>
<p>Sur votre profil, dans vos annonces, vos réponses, vos messages et vos avis,
il est interdit de publier ou d’envoyer :</p>
<ul>
  <li>du <strong>harcèlement</strong>, des menaces, des insultes ou des propos
  haineux (origine, religion, genre, orientation, handicap…) ;</li>
  <li>du contenu <strong>sexuel</strong> ou à caractère sexuel ;</li>
  <li>des <strong>tentatives de paiement hors de l’application</strong>
  (espèces, virement, PayPal, numéro de téléphone pour s’arranger ailleurs) :
  elles privent les deux parties de la protection en cas d’annulation ou de
  litige ;</li>
  <li>un <strong>faux profil</strong>, l’usurpation de l’identité d’autrui ou
  un palmarès inventé ;</li>
  <li>l’incitation à un comportement <strong>dangereux</strong> : combat sans
  protection, sous l’emprise de substances, ou combat de rue ;</li>
  <li>des arnaques, de la publicité ou des liens sans rapport avec le sport ;</li>
  <li>des vidéos dont vous n’avez pas le droit de partager le contenu.</li>
</ul>

<h2>Signaler et bloquer</h2>
<p>Depuis la fiche d’une personne, une conversation ou une annonce, le menu
<strong>⋯</strong> permet de <strong>signaler</strong> un profil, un message ou
une annonce, et de <strong>bloquer</strong> quelqu’un. Une personne bloquée ne
peut plus vous écrire, vous réserver ni répondre à vos annonces, et vous ne
vous voyez plus dans l’application. Vous pouvez la débloquer depuis votre
profil.</p>

<h2>Modération et sanctions</h2>
<p>Les messages et les annonces sont analysés automatiquement avant d’être
envoyés ou publiés ; un contenu signalé par cette analyse n’est pas transmis.
Les signalements sont examinés par l’équipe, qui peut, selon la gravité :</p>
<ul>
  <li>retirer le contenu en cause ;</li>
  <li>suspendre le compte, qui ne peut alors plus se connecter et disparaît de
  l’application.</li>
</ul>
<p>Si vous pensez qu’une décision est une erreur, écrivez-nous {contact}.</p>

<h2>Séances et paiements</h2>
<ul>
  <li>Chaque partenaire fixe son tarif au round. Vous payez exactement le
  montant affiché avant l’envoi de la demande.</li>
  <li>La commission de la plateforme est prélevée sur la part du partenaire,
  jamais ajoutée à votre total.</li>
  <li>Les paiements sont traités par Stripe. Une séance payée puis annulée
  avant son début est remboursée en totalité.</li>
  <li>Une annonce ne donne lieu à aucun paiement : un sparring payant se réserve
  ensuite depuis le profil du partenaire.</li>
</ul>

<h2>Responsabilité</h2>
<p>Le sparring est une activité de contact. FightConnect met des personnes en
relation, mais n’organise pas les séances et n’encadre pas les pratiquants.
Vous restez responsable de votre équipement, de votre condition physique et de
votre comportement, comme le précise la décharge acceptée à l’inscription.</p>

<h2>Vos données et votre compte</h2>
<p>Ce que nous collectons et pourquoi est décrit dans la
<a href="{PRIVACY_PATH}">politique de confidentialité</a>. Vous pouvez
<a href="{DELETION_PATH}">supprimer votre compte</a> à tout moment.</p>

<h2>Modifications</h2>
<p>Si ces conditions changent, la date en haut de cette page est mise à jour et
vous en serez informé dans l’application.</p>
""",
    )
