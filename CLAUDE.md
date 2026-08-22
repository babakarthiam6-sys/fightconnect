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
pytest                     # 105 tests ; MONGODB_TEST_URI=... REQUIRE_MONGO=1 pour les tests d'intégration
uvicorn app.main:app --reload

# Frontend (depuis frontend/)
npm test                   # 145 tests
npm run typecheck && npm run lint
npm run build:web           # export web + thème sombre de la coquille HTML
```

Après avoir modifié `.env`, relance avec `-c` : Metro met en cache les fichiers
transformés et garderait l'ancienne valeur des variables `EXPO_PUBLIC_*`.

## Modèle

Le produit met en relation des **personnes**, pas des séances publiées. Chacun
remplit un profil sportif (discipline, catégorie de poids, niveau, tarif au
round) et devient visible dans la recherche. On consulte une fiche, on envoie une
**demande** pour une date et un nombre de rounds ; le partenaire accepte ou
refuse. La commission de la plateforme est prélevée sur sa part, jamais ajoutée
au total payé. Une discussion permet de caler les détails ; elle est modérée.

## Invariants à ne pas casser

- L'application web est montée **après** toutes les routes de l'API. Montée avant,
  elle les masquerait toutes.
- L'unicité d'une demande en attente est portée par un **index unique partiel**,
  pas par une lecture préalable. Un contrôle lu en amont laisserait deux envois
  simultanés créer deux demandes identiques.
- Le remboursement est demandé **avant** de passer la demande en annulée : sinon
  un échec de Stripe ferait perdre la séance et l'argent.
- Le client HTTP ne rejoue que les `GET`. Rejouer un `POST` créerait un doublon ou
  un double débit.
- La modération ne bloque jamais la publication d'un **avis** : sans clé OpenAI,
  une heuristique locale prend le relais. Elle bloque en revanche un **message**
  signalé : un avis perdu se réécrit, une transaction sortie de la plateforme ne
  revient pas.
- Le point d'entrée WebSocket reçoit la base **par la dépendance**, jamais par un
  appel direct à `get_database()`. Sans cela il n'est pas testable, et il ne
  l'était pas.
- Le taux de commission vit à deux endroits (`backend/app/config.py` et
  `frontend/constants/config.ts`) parce que l'écran de réservation affiche le
  décompte avant que la demande n'existe. `frontend/__tests__/commission.test.ts`
  échoue si les deux divergent.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
