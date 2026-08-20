# FightConnect — contexte du projet

Plateforme de mise en relation de partenaires de sparring : on publie une séance,
on la trouve, on la paie, on la note.

- `frontend/` — React Native (Expo SDK 50, TypeScript strict), navigation `expo-router`.
  Le même code produit l'application mobile **et** une version web.
- `backend/` — FastAPI, MongoDB (motor), Stripe Connect, modération OpenAI.
  L'API sert aussi la version web.

## État réel

Tout ce qui est décrit ci-dessous existe, est testé, et est fusionné dans `main`.
**Rien n'est déployé** : aucun hébergeur, aucune base en ligne, aucune clé Stripe.
L'adresse `fightconnect-prod.up.railway.app` que l'on trouve dans d'anciens
documents ne répond pas.

| | |
| --- | --- |
| Tests backend | 86 (pytest) — dont 6 sur un vrai MongoDB |
| Tests frontend | 115 (Jest + Testing Library) |
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
npx expo export --platform web --clear --output-dir ../backend/webapp
```

## Invariants à ne pas casser

Ces règles ne se devinent pas en lisant un fichier isolé. Chacune est couverte par
un test qui échoue si on l'enfreint.

1. **L'application web est montée après toutes les routes de l'API.** Montée avant,
   elle masquerait `/api`, `/health` et `/docs`.
2. **L'inscription à une séance est une écriture conditionnée** au nombre de
   participants au moment de l'écriture. Un comptage lu en amont laisse deux
   personnes prendre la dernière place — mesuré : 6 entrants sur 10 sans la garde.
3. **Le remboursement précède la libération de la place.** Dans l'ordre inverse, un
   échec de Stripe fait perdre la place *et* l'argent.
4. **On refuse d'encaisser pour un organisateur non payable** (Stripe Connect
   incomplet). Sinon la plateforme accumule des dettes sans moyen de les régler.
5. **Le client HTTP ne rejoue que les `GET`.** Rejouer un `POST` créerait un doublon
   ou un double débit.
6. **La modération ne bloque jamais la publication d'un avis.** Sans clé OpenAI, une
   heuristique locale prend le relais. Un avis signalé n'entre pas dans la note de
   l'organisateur.
7. **Les statuts « complet » et « terminé » sont calculés à la lecture**, jamais
   stockés : ils ne peuvent pas se désynchroniser.

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
