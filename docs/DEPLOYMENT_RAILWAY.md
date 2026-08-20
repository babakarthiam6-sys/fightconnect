# Deployment guide — Railway

Ce document décrit deux chemins pour déployer FightConnect sur Railway :
- connexion GitHub + build via Dockerfile (recommandé)
- déploiement depuis une image Docker (GHCR)

Pré-requis
- Compte Railway
- Compte GitHub avec accès au repo `babakarthiam6-sys/fightconnect`
- Clés secrètes (ne jamais les committer) : Stripe keys, JWT secret, Mongo URI, OpenAI key

Option A — Deploy via GitHub (Repository)
1. Sur Railway, clique "New Project" → "Deploy from GitHub" (https://railway.com/new/github)
2. Connecte ton compte GitHub (assure-toi d'utiliser le compte `babakarthiam6-sys`).
3. Si Railway ne voit pas le repo, vérifie GitHub → Settings → Applications → Railway → Configure → coche `fightconnect` ou `All repositories`.
4. Sélectionne `babakarthiam6-sys/fightconnect`. Railway détecte le `Dockerfile` à la racine.
5. Build configuration :
   - Build command : (laisser vide si Dockerfile gère tout)
   - Start command : `uvicorn app.main:app --host 0.0.0.0 --port 8000`
   - Port : 8000
6. Dans Railway, ouvre la page "Variables" et ajoute les variables d'environnement (liste ci‑dessous).
7. Click "Deploy" et surveille les logs.

Option B — Deploy from Docker image (GHCR)
1. Dans GitHub Actions, le workflow `.github/workflows/ci-build-and-publish.yml` construit et pousse l'image sur GHCR.
2. Pour pousser sur GHCR depuis Actions, le repository doit permettre `packages: write` pour `GITHUB_TOKEN` ou ajouter un secret `GHCR_PAT` (personal access token with `write:packages`).
3. Après push, sur Railway → New Project → Deploy from container image, renseigne `ghcr.io/<owner>/fightconnect:latest`.

Variables d'environnement (obligatoires)
- MONGODB_URI (ex: mongodb+srv://user:pwd@cluster.mongodb.net/fightconnect)
- MONGODB_DB (ex: fightconnect)
- JWT_SECRET (min 32 chars)
- ENVIRONMENT=production
- STRIPE_SECRET_KEY
- STRIPE_PUBLISHABLE_KEY
- STRIPE_WEBHOOK_SECRET
- OPENAI_API_KEY (optionnel — si absent, la modération IA est désactivée et la heuristique locale prend le relais)

Frontend-only variables (si nécessaire)
- EXPO_PUBLIC_API_BASE_URL=https://<railway_app_url>/api/v1
- EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY

Configurer Stripe webhook
1. Dans Stripe Dashboard → Developers → Webhooks → Add endpoint
2. Endpoint URL: `https://<railway_app_url>/api/v1/payments/webhook`
3. Events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded` (selon besoin)
4. Ajoute la valeur `Signing secret` dans Railway as `STRIPE_WEBHOOK_SECRET`.

Tester localement
- Build et lancer via docker-compose (fichier fourni) :
  docker-compose up --build
- Vérifier endpoints:
  - GET http://localhost:8000/health
  - GET http://localhost:8000/api/v1/docs

Troubleshooting
- Si Railway ne voit pas le repo : révoque Railway dans GitHub → Settings → Applications → Authorized OAuth Apps → Railway → Reconnect and choose `All repositories` or select the repo.
- Si l'image ne démarre sur Railway : vérifier `Start command` and `PORT`.
- Logs : Railway fournit les logs de build et d'exécution. Copie/colle ici si tu veux que je regarde.


