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
pytest                     # 143 tests ; MONGODB_TEST_URI=... REQUIRE_MONGO=1 pour les tests d'intégration
uvicorn app.main:app --reload

# Frontend (depuis frontend/)
npm test                   # 214 tests
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
- Les textes de l'application vivent dans `frontend/i18n/fr.ts`, et `en.ts` en
  est typé comme une copie exacte : oublier une traduction fait échouer `tsc`.
  Une phrase écrite en dur dans un écran ne se voit pas, et ne se traduit jamais.
- Les listes d'identifiants — disciplines, niveaux, poids, pays, devises —
  existent des deux côtés parce que l'étape Docker ne copie que `backend/` dans
  l'image finale : un fichier commun à la racine n'y serait pas.
  `frontend/__tests__/sports.test.ts` compare les deux et échoue si l'un bouge
  sans l'autre.
- `to_minor_units` prend la devise : le yen et le franc CFA n'ont pas de
  subdivision. Multiplier par cent sans regarder ferait facturer mille yens
  cent mille.
- Les pays où Stripe verse de l'argent sont **demandés à Stripe**, jamais
  recopiés : sa couverture s'étend, et une liste figée refuserait en silence un
  pays devenu possible.
- Les routes de surveillance (`/api/v1/admin/*`) ne sont montées que si
  `ADMIN_TOKEN` est défini, ne renvoient que des compteurs, et n'écrivent
  jamais. `backend/tests/test_admin.py` vérifie qu'aucune donnée personnelle
  n'en sort.
- Le taux de commission vit à deux endroits (`backend/app/config.py` et
  `frontend/constants/config.ts`) parce que l'écran de réservation affiche le
  décompte avant que la demande n'existe. `frontend/__tests__/commission.test.ts`
  échoue si les deux divergent.

## Surveillance

`tools/fightconnect_mcp.py` est un serveur MCP sans dépendance qui expose trois
outils en lecture seule : `sante`, `apercu`, `routes`. Il se branche à Claude
Code ou à l'application Claude et lit la production directement. Voir l'en-tête
du fichier pour la configuration.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
