# FightConnect — contexte du projet

Plateforme de mise en relation de partenaires de sparring. Chacun remplit un
profil sportif (discipline, catégorie de poids, niveau, tarif au round) et devient
visible dans la recherche. On consulte une fiche, on envoie une demande pour une
date et un nombre de rounds ; le partenaire accepte ou refuse, puis on paie et on
note.

- `frontend/` — React Native (Expo SDK 50, TypeScript strict), navigation `expo-router`.
  Le même code produit l'application mobile **et** une version web.
- `backend/` — FastAPI, MongoDB (motor), Stripe Connect, modération OpenAI.
  L'API sert aussi la version web.

## État réel

Tout ce qui est décrit ci-dessous existe et est testé.
**En ligne sur `https://fightconnect-production.up.railway.app`** — API et
application web servies par le même service Railway, base MongoDB attachée au
même projet. Stripe et OpenAI ne sont pas configurés : les séances gratuites
fonctionnent, la modération retombe sur son heuristique locale.

| | |
| --- | --- |
| Tests backend | 86 (pytest) — dont 6 sur un vrai MongoDB |
| Tests frontend | 135 (Jest + Testing Library) |
| Vérifications | ESLint, `tsc --noEmit`, bundles natif et web |
| CI | deux chaînes GitHub Actions, sur chaque push |

## Commandes

```bash
# backend/
pytest                                    # base simulée, aucun service requis
MONGODB_TEST_URI=mongodb://127.0.0.1:27017 REQUIRE_MONGO=1 pytest   # + intégration
uvicorn app.main:app --reload

# frontend/
npm test && npm run typecheck && npm run lint
npm run build:web                         # export web + thème sombre de la coquille
```

## Invariants à ne pas casser

Ces règles ne se devinent pas en lisant un fichier isolé. Chacune est couverte par
un test qui échoue si on l'enfreint.

1. **L'application web est montée après toutes les routes de l'API.** Montée avant,
   elle masquerait `/api`, `/health` et `/docs`.
2. **L'unicité d'une demande en attente est portée par un index unique partiel**,
   pas par une lecture préalable. Un double appui sur « Envoyer » suffit à créer
   deux requêtes simultanées qui liraient toutes deux « aucune demande en
   attente ». Le filtre partiel garde un créneau refusé redemandable.
3. **Le remboursement précède le passage en « annulée ».** Dans l'ordre inverse, un
   échec de Stripe fait perdre la séance *et* l'argent.
4. **On refuse d'encaisser pour un partenaire non payable** (Stripe Connect
   incomplet). Sinon la plateforme accumule des dettes sans moyen de les régler.
   Et on n'encaisse pas avant qu'il ait accepté : la demande peut être refusée.
5. **Le client HTTP ne rejoue que les `GET`.** Rejouer un `POST` créerait un doublon
   ou un double débit.
6. **La modération ne bloque jamais la publication d'un avis.** Sans clé OpenAI, une
   heuristique locale prend le relais. Un avis signalé n'entre pas dans la note du
   partenaire.
7. **La fiche publique d'un partenaire est construite champ par champ**, jamais par
   soustraction d'un profil complet : une soustraction laisserait passer tout champ
   ajouté plus tard, à commencer par l'email.
8. **La commission sort de la part du partenaire**, elle ne s'ajoute pas au total.
   Son taux vit à deux endroits (`backend/app/config.py`,
   `frontend/constants/config.ts`) parce que l'écran de réservation affiche le
   décompte avant que la demande n'existe ; un test échoue si les deux divergent.
9. **L'export web vise l'origine qui le sert**, jamais un domaine écrit en dur : un
   domaine figé casse silencieusement toute l'application dès que l'hébergeur en
   attribue un autre.

## Pièges rencontrés, à ne pas réintroduire

- **Variables d'environnement Expo.** `process.env[clé]` en accès dynamique renvoie
  `undefined` : Metro inline les `EXPO_PUBLIC_*` à la transformation. Il faut les
  référencer littéralement. Et après modification d'un `.env`, relancer avec `-c` :
  le cache Metro conserve sinon l'ancienne valeur, sans avertissement.
- **Versions Expo SDK 50.** `@expo/vector-icons` doit rester en 14.0.x ; la 14.1
  entraîne un `expo-font` incompatible et l'application meurt au chargement sur
  `registerWebModule is not a function`.
- **Web.** `@stripe/stripe-react-native` et `@react-native-community/datetimepicker`
  n'ont pas d'implémentation web ; voir `shims/` et `DateTimeField.web.tsx`.
- **Autorisations Stripe.** Ne pas revenir à `capture_method="manual"` pour retenir
  l'argent jusqu'à la séance : une autorisation expire sous sept jours.

## Conventions

- Commentaires et messages utilisateur **en français**.
- Un commentaire explique *pourquoi*, jamais *quoi*.
- Tout correctif de bug arrive avec un test qui échoue sans lui — vérifié en
  retirant le correctif.
- Les montants circulent en euros, jamais en centimes, sauf à la frontière Stripe.

## Ce qui reste à construire

Chat temps réel (WebSocket + modération), notifications push, matchmaking IA.
Aujourd'hui les recommandations reposent sur une heuristique simple.
