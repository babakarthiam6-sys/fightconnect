# FightConnect

Application mobile de mise en relation de partenaires de sparring : on publie une
séance, on la trouve, on la paie, on la note.

| Dossier | Contenu |
| --- | --- |
| [`frontend/`](frontend/) | Application React Native (Expo, TypeScript) |
| [`backend/`](backend/) | API FastAPI (MongoDB, Stripe, modération IA) |

## Démarrage rapide

```bash
# 1. L'API
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env          # MONGODB_URI et JWT_SECRET au minimum
uvicorn app.main:app --reload # http://localhost:8000/docs

# 2. L'application mobile, dans un autre terminal
cd frontend
npm install
cp .env.example .env          # EXPO_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
npx expo start                # scannez le QR code avec Expo Go
```

Chaque dossier a son propre README avec le détail : configuration, tests,
déploiement.

## Qualité

141 tests automatisés, rejoués par GitHub Actions à chaque push :

- **frontend** — 89 tests (Jest + Testing Library), ESLint, vérification des
  types et bundle Metro.
- **backend** — 52 tests (pytest), base MongoDB simulée en mémoire, Stripe doublé.
