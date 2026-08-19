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

173 tests automatisés, rejoués par GitHub Actions à chaque push :

- **frontend** — 105 tests (Jest + Testing Library), ESLint, vérification des
  types et bundle Metro.
- **backend** — 68 tests (pytest) : 62 sur base simulée, 6 d'intégration sur un vrai
  MongoDB fourni par la CI. Stripe est doublé partout.

Parmi eux, 16 tests de contrat font tourner les normaliseurs du mobile sur des
réponses réellement capturées sur l'API : un champ renommé côté serveur casse un
test au lieu de casser l'application.
