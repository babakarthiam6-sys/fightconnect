# FightConnect

Application mobile de mise en relation de partenaires de sparring.
`frontend/` (React Native / Expo, aussi servi en web) · `backend/` (FastAPI, MongoDB, Stripe).

## Avant de lire des fichiers

Avant de lire des fichiers, consulte d'abord `graphify-out/graph.json` pour comprendre
la structure du projet et ne lire que le strict nécessaire. Utilise `/graphify query`
pour les questions sur l'architecture.

**La carte est datée.** Elle porte le commit sur lequel elle a été construite (voir
`graphify-out/GRAPH_REPORT.md`). Après toute modification du code, régénère-la —
`graphify update .`, sans appel à un modèle ni coût — sinon elle décrit un projet
qui n'existe plus. En cas de doute entre la carte et le code, **le code fait foi**.

## Commandes

```bash
# Backend (depuis backend/)
pytest                     # 83 tests ; MONGODB_TEST_URI=... REQUIRE_MONGO=1 pour les tests d'intégration
uvicorn app.main:app --reload

# Frontend (depuis frontend/)
npm test                   # 115 tests
npm run typecheck && npm run lint
npx expo export --platform web --clear --output-dir ../backend/webapp
```

Après avoir modifié `.env`, relance avec `-c` : Metro met en cache les fichiers
transformés et garderait l'ancienne valeur des variables `EXPO_PUBLIC_*`.

## Invariants à ne pas casser

- L'application web est montée **après** toutes les routes de l'API. Montée avant,
  elle les masquerait toutes.
- L'inscription à une séance passe par une écriture **conditionnée** au nombre de
  participants. Un comptage lu en amont laisserait deux personnes prendre la même place.
- Le remboursement est demandé **avant** de libérer la place : sinon un échec de
  Stripe ferait perdre la place et l'argent.
- Le client HTTP ne rejoue que les `GET`. Rejouer un `POST` créerait un doublon ou
  un double débit.
- La modération ne bloque jamais la publication d'un avis : sans clé OpenAI, une
  heuristique locale prend le relais.
