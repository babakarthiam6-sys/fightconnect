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
   - Build command : laisser vide, le `Dockerfile` fait tout.
   - Start command : **laisser vide également.** Le `Dockerfile` lance déjà
     `uvicorn --port ${PORT:-8000}`, et Railway injecte `PORT`. Forcer un port en
     dur ferait écouter l'application ailleurs que là où Railway l'attend, et le
     déploiement resterait injoignable.
6. Dans Railway, ouvre la page "Variables" et ajoute les variables d'environnement (liste ci‑dessous).
7. Click "Deploy" et surveille les logs.

Option B — Deploy from Docker image (GHCR)

Non mise en place, et documentée seulement pour mémoire : le déploiement se fait
par l'option A. Publier une image sur GHCR demanderait un workflow qui construit
et pousse l'image ; il n'y en a pas dans ce dépôt, et il n'y a pas de raison d'en
ajouter un tant que Railway se connecte directement à GitHub. Une image
multi-architecture construite à chaque commit coûte de longues minutes de CI pour
un artefact que personne ne récupère.

Si ce besoin apparaît un jour :
1. Ajouter un workflow qui construit le `Dockerfile` et pousse sur GHCR, avec la
   permission `packages: write` pour `GITHUB_TOKEN`.
2. Sur Railway → New Project → Deploy from container image, renseigner
   `ghcr.io/<owner>/fightconnect:latest`.

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

Il n'y a pas de `docker-compose.yml` dans ce dépôt : le `Dockerfile` de la racine
suffit, et MongoDB se lance à part.

    docker run -d --name fc-mongo -p 27017:27017 mongo:7
    docker build -t fightconnect .
    docker run --rm -p 8000:8000 \
      -e MONGODB_URI=mongodb://host.docker.internal:27017 \
      -e MONGODB_DB=fightconnect \
      -e JWT_SECRET=une-chaine-de-32-caracteres-minimum \
      fightconnect

Vérifier ensuite :
- GET http://localhost:8000/health — `database: true` confirme que Mongo répond
- GET http://localhost:8000/docs

Troubleshooting
- Si Railway ne voit pas le repo : révoque Railway dans GitHub → Settings → Applications → Authorized OAuth Apps → Railway → Reconnect and choose `All repositories` or select the repo.
- Si l'image ne démarre sur Railway : vérifier `Start command` and `PORT`.
- Logs : Railway fournit les logs de build et d'exécution. Copie/colle ici si tu veux que je regarde.


