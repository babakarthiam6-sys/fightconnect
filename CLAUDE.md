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
npm run build:web           # export web + thème sombre de la coquille HTML
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

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
