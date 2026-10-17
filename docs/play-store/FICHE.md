# Fiche Play Store — tout est prêt à copier-coller

Ce dossier contient tout ce que la Play Console demande pour publier FightConnect.
Chaque bloc gris se copie tel quel. Les limites de caractères ont été vérifiées.

> **Avant de commencer** : l'application doit être en ligne (Railway payé) et la
> variable `CONTACT_EMAIL` doit être définie sur Railway, sinon les pages de
> confidentialité et de suppression de compte n'affichent aucun moyen de contact.

---

## 1. Fiche principale du Store

### Nom de l'application (30 caractères max)

```
FightConnect – Sparring
```

### Description courte (80 caractères max)

```
Trouve un partenaire de sparring près de chez toi et réserve en deux appuis.
```

### Description complète (4 000 caractères max)

```
FightConnect met en relation les combattants qui cherchent un partenaire de sparring.

Boxe anglaise, muay-thaï, kickboxing, MMA, JJB, lutte, karaté, judo : trouve quelqu'un de ton niveau et de ta catégorie de poids, dans ta ville, et réserve une séance en deux appuis.

🥊 TROUVE LE BON PARTENAIRE
• Recherche par ville, discipline, niveau et catégorie de poids
• Fiches détaillées : nombre de combats, années d'expérience, taille, tarif au round
• Notes et avis laissés après chaque séance : tu sais avec qui tu montes
• Galerie vidéo : regarde ses combats, ses sparrings et son shadow boxing

📣 PUBLIE UNE ANNONCE
• « Je cherche un sparring » ou « je cherche un adversaire » pour un gala ou un interclub
• Coach ? Décris ton combattant : poids, palmarès, vidéo
• Reçois des réponses, consulte les profils et choisis ton partenaire

📅 RÉSERVE SIMPLEMENT
• Choisis une date et un nombre de rounds
• Le prix est affiché avant l'envoi de la demande, sans frais cachés
• Ton partenaire accepte ou refuse, et tu suis tout depuis l'onglet Réservations

💬 CALE LES DÉTAILS
• Discussion intégrée pour fixer le lieu, l'heure et l'intensité
• Notification à chaque nouveau message
• Messagerie modérée pour protéger tout le monde

💳 PAIE EN SÉCURITÉ
• Paiement par carte avec Stripe : tes données bancaires ne passent jamais par nos serveurs
• Une séance payée puis annulée avant son début est remboursée en totalité

💰 DONNE DES ROUNDS, SOIS PAYÉ
• Rends-toi disponible et fixe ton tarif au round
• Reçois tes paiements directement sur ton compte
• La commission de la plateforme est prélevée sur ta part : ton partenaire paie exactement le tarif affiché

FightConnect s'adresse aux sportifs majeurs. Le sparring est un sport de contact : porte toujours ton équipement de protection et respecte le niveau de ton partenaire.
```

### Images

| Champ de la Play Console | Fichier |
|---|---|
| Icône de l'application (512 × 512) | `icone-512.png` |
| Image de présentation (1024 × 500) | `banniere-1024x500.png` |
| Captures d'écran du téléphone (2 à 8) | `captures/1.png` à `captures/7.png`, dans l'ordre |

Les captures viennent de la vraie application, avec des profils de démonstration.

---

## 2. Coordonnées et liens

| Champ | Valeur |
|---|---|
| Catégorie | **Sports** |
| Adresse e-mail | la même que `CONTACT_EMAIL` sur Railway |
| Règles de confidentialité | `https://fightconnect-production.up.railway.app/confidentialite` |
| Suppression du compte (lien web) | `https://fightconnect-production.up.railway.app/suppression-compte` |

Si l'adresse du site change un jour (autre hébergeur, nom de domaine), il faudra
mettre à jour ces deux liens **et** `frontend/eas.json`.

---

## 3. Contenu de l'application (questionnaires)

### Accès à l'application

Choisir **« Certaines fonctionnalités sont restreintes »**, puis donner aux
vérificateurs de Google un compte de test. Crée ce compte toi-même dans
l'application en ligne, remplis son profil sportif et rends-le disponible.

```
Créer un compte n'est pas nécessaire : utilisez le compte de test ci-dessous.
Email : [l'email du compte de test]
Mot de passe : [son mot de passe]
Toutes les fonctionnalités (recherche, fiche partenaire, réservation, discussion) sont accessibles avec ce compte.
```

### Annonces

**Non**, l'application ne contient pas d'annonces.

### Public cible

**18 ans et plus** uniquement. À la question « L'application pourrait-elle
attirer les enfants ? » : **Non**.

### Classification du contenu (questionnaire IARC)

- Catégorie : **Réseaux sociaux ou communication** (la plus proche : des
  personnes se contactent et discutent).
- Violence : **Non**. L'application montre des fiches et des messages. Les vidéos
  de combat sont des liens qui s'ouvrent dans YouTube, TikTok ou Instagram.
- Les utilisateurs peuvent interagir ou échanger du contenu : **Oui** (discussion).
- Partage de la position de l'utilisateur : **Non**. Seule une ville tapée à la main
  est affichée, jamais la position du téléphone.
- Achats numériques : **Non**. On paie une séance de sport réelle, pas un contenu
  numérique.
- Jeux d'argent : **Non**.

### Fonctionnalités financières

**« Mon application ne propose aucune des fonctionnalités financières listées »**.
FightConnect vend des séances de sport, comme une application de réservation. Le
paiement est sous-traité à Stripe.

### Application d'actualités, de santé, gouvernementale

**Non** aux trois.

---

## 4. Sécurité des données

Réponses alignées sur la page `/confidentialite` de l'application.

**Questions générales**

| Question | Réponse |
|---|---|
| L'application collecte-t-elle ou partage-t-elle des données ? | **Oui** |
| Les données sont-elles chiffrées pendant le transfert ? | **Oui** (HTTPS) |
| Les utilisateurs peuvent-ils demander la suppression de leurs données ? | **Oui** (dans l'app et par le lien web ci-dessus) |

**Partage** : répondre **Non** partout. Pour Google, envoyer des données à un
prestataire qui travaille pour toi (Stripe, l'hébergeur, OpenAI pour la
modération, Expo pour les notifications) n'est pas un « partage ». Un profil que
l'utilisateur rend lui-même visible ne l'est pas non plus.

**Données collectées** (toutes : *collectées*, *non partagées*, *pas de traitement éphémère*)

| Type de données (Play Console) | Ce que c'est dans FightConnect | Obligatoire ? | Finalités à cocher |
|---|---|---|---|
| Informations personnelles › Nom | prénom, nom | Obligatoire | Fonctionnalité de l'appli, Gestion du compte |
| Informations personnelles › Adresse e-mail | email du compte | Obligatoire | Fonctionnalité de l'appli, Gestion du compte, Prévention des fraudes et sécurité |
| Informations personnelles › ID utilisateur | identifiant du compte | Obligatoire | Fonctionnalité de l'appli, Gestion du compte |
| Informations personnelles › Autres informations | ville, taille, catégorie de poids, niveau, combats, expérience | Facultatif | Fonctionnalité de l'appli |
| Informations financières › Informations de paiement de l'utilisateur | carte saisie dans le formulaire Stripe | Facultatif | Fonctionnalité de l'appli |
| Informations financières › Historique des achats | séances payées, montants | Facultatif | Fonctionnalité de l'appli |
| Messages › Autres messages dans l'appli | discussions entre utilisateurs | Facultatif | Fonctionnalité de l'appli, Prévention des fraudes et sécurité |
| Photos et vidéos | — | **Non collecté** (les vidéos sont de simples liens) | — |
| Contenu de l'appli › Autres contenus générés par l'utilisateur | présentation, avis, liens vidéo, annonces et réponses aux annonces | Facultatif | Fonctionnalité de l'appli, Prévention des fraudes et sécurité |
| Identifiants de l'appareil ou autres | jeton de notification | Facultatif | Fonctionnalité de l'appli |
| Position | — | **Non collecté** | — |

---

## 5. Publication : l'ordre des étapes

1. **Railway** : payer, puis définir `CONTACT_EMAIL`, `ENVIRONMENT=production`,
   `JWT_SECRET` et les clés Stripe.
2. **Google Play Console** : créer un compte développeur **personnel** (25 $,
   une seule fois), puis faire vérifier ton identité.
3. **Téléphone Android** : Google demande aux nouveaux comptes personnels de
   prouver qu'ils ont accès à un vrai téléphone Android (Android 10 ou plus). Il
   suffit d'en **emprunter un** quelques minutes pour installer l'app Play
   Console et toucher « Vérifier ».
4. **Expo** : créer un compte gratuit sur expo.dev, créer le projet
   `fightconnect`, et générer un jeton d'accès (`EXPO_TOKEN`). Le Project ID et
   le jeton servent à fabriquer l'application sans ordinateur, depuis GitHub
   (workflow « Build Android (Play Store) »).
5. **Fiche et questionnaires** : remplir les sections 1 à 4 de ce document.
6. **Test fermé** : obligatoire pour un nouveau compte personnel. **12 testeurs**
   avec un téléphone Android doivent garder l'application installée pendant
   **14 jours d'affilée**. C'est l'étape la plus longue : commence à recruter
   tes testeurs dès maintenant (club, partenaires d'entraînement…).
7. **Production** : après les 14 jours, demander l'accès à la production depuis
   le tableau de bord de la Play Console, puis publier.
