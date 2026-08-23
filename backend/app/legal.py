"""Pages publiques exigées par les magasins d'applications.

Pourquoi le serveur les rend lui-même
--------------------------------------

Apple et Google réclament tous deux une **adresse web publique** pour la
politique de confidentialité, et Google en réclame une seconde pour la
suppression de compte : elle doit être atteignable **sans installer
l'application**, par quelqu'un qui a désinstallé et veut effacer ses données.

Les faire vivre ici plutôt que sur un site à part évite le piège classique : une
adresse déclarée au magasin, hébergée ailleurs, qui expire ou change et fait
retirer l'application des mois plus tard sans que personne ne comprenne
pourquoi. Tant que l'API tourne, ces pages répondent.

Elles sont volontairement en HTML nu, sans dépendance ni gabarit : une page
juridique doit rester lisible même le jour où tout le reste est cassé.
"""

from __future__ import annotations

CONTACT = "babakarthiam6@gmail.com"

_STYLE = """
  :root { color-scheme: dark; }
  body {
    background: #0C0C0E; color: #E8E8EC; margin: 0;
    font: 16px/1.65 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  main { max-width: 46rem; margin: 0 auto; padding: 3rem 1.25rem 5rem; }
  h1 { font-size: 1.9rem; line-height: 1.2; margin: 0 0 .35rem; }
  h2 { font-size: 1.15rem; margin: 2.4rem 0 .6rem; color: #FF6B35; }
  .date { color: #8A8A94; font-size: .9rem; margin-bottom: 2rem; }
  p, li { color: #C9C9D2; }
  ul { padding-left: 1.2rem; }
  a { color: #5AA9F5; }
  .encadre {
    background: #17171B; border: 1px solid #26262D; border-radius: 12px;
    padding: 1rem 1.25rem; margin: 1.5rem 0;
  }
  footer { margin-top: 3rem; color: #8A8A94; font-size: .85rem; }
"""


def _page(titre: str, corps: str, langue: str = "fr") -> str:
    return f"""<!doctype html>
<html lang="{langue}"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{titre} · FightConnect</title>
<style>{_STYLE}</style>
</head><body><main>{corps}
<footer>FightConnect · <a href="mailto:{CONTACT}">{CONTACT}</a></footer>
</main></body></html>"""


CONFIDENTIALITE_FR = _page(
    "Politique de confidentialité",
    f"""
<h1>Politique de confidentialité</h1>
<p class="date">FightConnect · dernière mise à jour : août 2026</p>

<p>FightConnect met en relation des personnes qui cherchent un partenaire de
sparring. Cette page dit quelles données nous conservons, pourquoi, et comment
vous pouvez les effacer.</p>

<h2>Ce que nous conservons</h2>
<ul>
  <li><strong>Votre compte</strong> : email, mot de passe (chiffré, jamais lisible
      par nous), prénom et nom.</li>
  <li><strong>Votre profil sportif</strong> : discipline, niveau, catégorie de
      poids, taille, nombre de combats, années de pratique, ville, pays, tarif
      au round, présentation.</li>
  <li><strong>Vos demandes de séance</strong> : date, nombre de rounds, montant,
      état.</li>
  <li><strong>Vos messages</strong> avec les autres membres.</li>
  <li><strong>Vos avis</strong> après une séance.</li>
</ul>

<h2>Ce que nous ne conservons pas</h2>
<div class="encadre">
  <p>Nous ne voyons <strong>jamais</strong> vos coordonnées bancaires. Les
  paiements passent entièrement par Stripe, qui collecte et conserve ces
  données. Nous ne recevons de sa part qu'un identifiant de transaction et un
  état : payé, remboursé, échoué.</p>
</div>
<p>Nous ne suivons pas votre position. Nous n'utilisons ni publicité, ni traceur
publicitaire, et nous ne vendons aucune donnée à personne.</p>

<h2>Pourquoi nous les conservons</h2>
<p>Pour faire fonctionner le service : vous rendre visible dans la recherche,
permettre à un partenaire de vous contacter, tenir l'historique de vos séances
et prélever la commission de la plateforme. Rien d'autre.</p>

<h2>Modération</h2>
<p>Les messages et les avis passent par un filtre automatique qui repère les
insultes et les tentatives de sortir la transaction de la plateforme. Un message
signalé n'est pas délivré. Vous pouvez signaler un contenu ou bloquer une
personne depuis l'application, à tout moment.</p>

<h2>Qui d'autre y a accès</h2>
<ul>
  <li><strong>Stripe</strong> — paiements et versements.</li>
  <li><strong>MongoDB Atlas</strong> — hébergement de la base.</li>
  <li><strong>Railway</strong> — hébergement du serveur.</li>
  <li><strong>OpenAI</strong> — modération des textes, lorsqu'elle est activée.
      Seul le texte à vérifier est transmis, sans votre identité.</li>
</ul>

<h2>Effacer votre compte</h2>
<p>Depuis l'application : <em>Profil → Supprimer mon compte</em>. C'est immédiat
et définitif. Votre compte, votre email et votre profil disparaissent.</p>
<p>Ce qui appartient aussi à quelqu'un d'autre — vos messages dans la
conversation d'un tiers, vos avis sur un partenaire, les séances passées — reste
en place mais devient anonyme : plus de nom, plus d'email, plus de lien vers
vous.</p>
<p>Sans l'application, écrivez à <a href="mailto:{CONTACT}">{CONTACT}</a> :
voir <a href="/suppression">la page dédiée</a>.</p>

<h2>Combien de temps</h2>
<p>Tant que votre compte existe. Les séances payées restent conservées le temps
imposé par les obligations comptables, sous forme anonyme après suppression.</p>

<h2>Vos droits</h2>
<p>Accès, rectification, effacement, portabilité, opposition : écrivez à
<a href="mailto:{CONTACT}">{CONTACT}</a>. Nous répondons sous trente jours.</p>

<h2>Âge minimum</h2>
<p>FightConnect est réservé aux personnes majeures. Les sports de combat
comportent un risque de blessure, et chaque membre accepte une décharge de
responsabilité à l'inscription.</p>
""",
)


SUPPRESSION_FR = _page(
    "Supprimer mon compte",
    f"""
<h1>Supprimer mon compte</h1>
<p class="date">FightConnect</p>

<h2>Depuis l'application — immédiat</h2>
<p>Ouvrez l'application, allez dans <strong>Profil</strong>, faites défiler
jusqu'à <strong>Supprimer mon compte</strong>, puis confirmez avec votre mot de
passe. La suppression est immédiate et définitive.</p>

<h2>Sans l'application</h2>
<p>Si vous l'avez désinstallée, écrivez à
<a href="mailto:{CONTACT}?subject=Suppression%20de%20mon%20compte%20FightConnect">{CONTACT}</a>
depuis l'adresse email de votre compte. Nous supprimons sous trente jours.</p>

<h2>Ce qui est effacé</h2>
<ul>
  <li>Votre compte : email, mot de passe, identité.</li>
  <li>Votre profil sportif et votre présentation.</li>
  <li>Le jeton de notification de votre téléphone.</li>
  <li>Vos demandes de séance encore en attente, qui sont annulées.</li>
</ul>

<h2>Ce qui reste, sous forme anonyme</h2>
<ul>
  <li>Vos messages dans la conversation de l'autre personne — les effacer
      trouerait un fil dont elle est copropriétaire.</li>
  <li>Vos avis sur un partenaire — sans quoi il suffirait de supprimer son
      compte pour faire disparaître les mauvaises notes qu'on a reçues.</li>
  <li>Les séances déjà passées, dans l'historique de l'autre partie.</li>
</ul>
<p>Dans les trois cas, votre nom, votre email et tout lien vers vous sont
retirés.</p>

<div class="encadre">
  <p><strong>Une séance payée et à venir bloque la suppression.</strong>
  Annulez-la d'abord depuis l'application : vous serez remboursé, puis vous
  pourrez supprimer votre compte.</p>
</div>
""",
)
