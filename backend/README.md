# FightConnect — Backend (FastAPI)

API de mise en relation de partenaires de sparring : comptes, séances, paiements
Stripe et modération des avis.

> **Si vous avez déjà un backend ailleurs**, celui-ci est indépendant : supprimez
> le dossier `backend/` et pointez simplement l'app mobile sur votre URL. Il a été
> écrit pour respecter exactement le contrat que le frontend consomme.

## Stack

FastAPI · MongoDB (motor) · JWT (PyJWT) · bcrypt (passlib) · Stripe · OpenAI
Moderation · pytest.

## Démarrer en local

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env          # renseignez au minimum MONGODB_URI et JWT_SECRET
uvicorn app.main:app --reload
```

Documentation interactive : <http://localhost:8000/docs> · sonde : `/health`.

MongoDB en local via Docker :

```bash
docker run -d -p 27017:27017 --name fightconnect-mongo mongo:7
```

## Tests

```bash
pytest
```

41 tests, sans MongoDB ni Stripe : la base est simulée en mémoire
(`mongomock-motor`) et Stripe est remplacé par un double dans les tests de
paiement.

| Fichier | Couvre |
| --- | --- |
| `test_auth.py` | inscription, doublon d'email, décharge obligatoire, connexion, jeton invalide |
| `test_sparrings.py` | création, filtres, pagination, participation, séance complète, annulation |
| `test_payments.py` | intention de paiement, isolation de l'historique, accès payant, webhook |
| `test_moderation.py` | droit de laisser un avis, signalement, note de l'organisateur, profil de risque |
| `test_revenue.py` | statistiques et commission |

## Endpoints

Tous préfixés par `/api/v1`.

| Méthode | Route | Auth | Rôle |
| --- | --- | :---: | --- |
| POST | `/auth/signup` | — | Créer un compte (décharge obligatoire) |
| POST | `/auth/login` | — | Se connecter |
| GET | `/auth/me` | ✅ | Profil courant |
| GET | `/sparrings` | — | Liste paginée et filtrable |
| POST | `/sparrings` | ✅ | Publier une séance |
| GET | `/sparrings/{id}` | — | Détail |
| POST | `/sparrings/{id}/join` | ✅ | Rejoindre (paiement exigé si payante) |
| POST | `/sparrings/{id}/cancel` | ✅ | Annuler sa participation |
| GET | `/sparrings/{id}/reviews` | — | Avis d'une séance |
| POST | `/payments/create-intent` | ✅ | Créer un PaymentIntent Stripe |
| GET | `/payments/history` | ✅ | Historique personnel |
| POST | `/payments/webhook` | — | Évènements Stripe (signature vérifiée) |
| GET | `/revenue/stats` | ✅ | Gains, solde, note moyenne |
| POST | `/moderation/reviews` | ✅ | Publier un avis (modéré) |
| GET | `/moderation/user-risk/{id}` | ✅ | Profil de risque |
| GET | `/moderation/recommendations` | ✅ | Séances suggérées |

## Choix de conception

- **Une place payante n'est accordée qu'après paiement abouti.** `join` vérifie
  l'existence d'un paiement `succeeded` non encore consommé, puis le marque
  consommé. Sans cela, l'endpoint donnerait accès gratuitement à une séance payante.
- **La clé secrète Stripe ne sort jamais du serveur.** Le mobile ne reçoit qu'un
  `client_secret`, ce qui lui permet d'ouvrir la Payment Sheet sans manipuler de
  données de carte. Un webhook confirme le paiement ; en développement, les
  paiements en attente sont resynchronisés à la lecture de l'historique.
- **La modération ne bloque jamais la publication.** Si OpenAI est absent ou en
  panne, une heuristique locale prend le relais : un faux négatif vaut mieux
  qu'un avis perdu. Un avis signalé n'entre pas dans la note de l'organisateur,
  sinon un commentaire abusif ferait chuter sa moyenne.
- **Connexion : un seul message d'erreur.** Distinguer « email inconnu » de
  « mot de passe faux » permettrait d'énumérer les comptes existants.
- **Le statut « complet » est calculé**, jamais stocké : il ne peut pas se
  désynchroniser du nombre réel de participants.
- **Le démarrage tolère une base indisponible** : l'API répond `degraded` sur
  `/health` au lieu de tomber en boucle de redémarrage.

## Déploiement

Le `Dockerfile` et `railway.json` sont prêts (sonde `/health`). Variables à
définir sur l'hébergeur : `MONGODB_URI`, `MONGODB_DB`, `JWT_SECRET`,
`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`,
et `OPENAI_API_KEY` si vous voulez la modération IA.
