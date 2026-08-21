# FightConnect

Application mobile de mise en relation de partenaires de sparring : on cherche
quelqu'un à son niveau et dans sa catégorie de poids, on lui demande une séance
au round, on paie, on note.

| Dossier | Contenu |
| --- | --- |
| [`frontend/`](frontend/) | Application React Native (Expo, TypeScript) — mobile **et** web |
| [`backend/`](backend/) | API FastAPI (MongoDB, Stripe, modération IA) |

L'application existe en deux formes issues du même code : l'application mobile
installée, et une **version web** que l'API sert elle-même. Un seul déploiement
suffit donc pour tout mettre en ligne, et l'application est utilisable depuis un
navigateur sans rien installer — utile quand on n'a pas d'ordinateur sous la
main. Seul le paiement par carte reste réservé à l'application installée : la
feuille de paiement Stripe est un composant natif.

## Démarrage rapide

```bash
# 1. L'API (sert aussi la version web si elle a été construite)
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

- **frontend** — 115 tests (Jest + Testing Library), ESLint, vérification des
  types et bundle Metro.
- **backend** — 86 tests (pytest) : 62 sur base simulée, 6 d'intégration sur un vrai
  MongoDB fourni par la CI. Stripe est doublé partout.

Parmi eux, 16 tests de contrat font tourner les normaliseurs du mobile sur des
réponses réellement capturées sur l'API : un champ renommé côté serveur casse un
test au lieu de casser l'application.
