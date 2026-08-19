# FightConnect — Frontend (React Native / Expo)

Application mobile de mise en relation de partenaires de sparring : authentification,
publication et réservation de séances, paiement Stripe, avis modérés par IA.

## Stack

| Rôle | Choix |
| --- | --- |
| Runtime | Expo SDK 50, React Native 0.73, React 18.2 |
| Navigation | `expo-router` v3 (routing par fichiers, typed routes) |
| Réseau | `axios` + intercepteurs (JWT, retry, normalisation d'erreurs) |
| Validation | `zod` |
| État | React Context (auth, réseau, stats) + `zustand` (filtres) |
| Persistance | `@react-native-async-storage/async-storage` |
| Paiement | `@stripe/stripe-react-native` (Payment Sheet) |
| Notifications | `react-native-toast-notifications` |
| Dates | `date-fns` (locale `fr`) |
| Tests | `jest-expo` + `@testing-library/react-native` |
| Qualité | ESLint (`eslint-config-expo`) + Prettier |

## Démarrage

```bash
cd frontend
npm install
cp .env.example .env      # renseignez l'URL de l'API et la clé publique Stripe
npx expo start            # puis scannez le QR code avec Expo Go
```

> **Après avoir modifié `.env`, relancez avec `-c`** (`npx expo start -c`, ou
> `npx expo export --clear`). Metro met en cache les fichiers transformés, et les
> variables `EXPO_PUBLIC_*` sont inlinées à la transformation : sans vider le
> cache, l'ancienne valeur reste dans le bundle sans le moindre avertissement.

> La Payment Sheet Stripe nécessite un module natif : elle ne fonctionne pas dans
> Expo Go. Le reste de l'app (auth, sparrings, avis) s'y teste normalement. Pour le
> paiement, utilisez un development build :
> `npx expo run:android` / `npx expo run:ios`, ou `eas build --profile development`.

## Variables d'environnement

Toutes préfixées `EXPO_PUBLIC_` (inlinées au build, donc publiques par nature — aucune
clé secrète ici, la clé secrète Stripe reste côté FastAPI).

| Variable | Rôle |
| --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | Base de l'API, sans slash final |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Clé publique Stripe (`pk_test_…`) |
| `EXPO_PUBLIC_STRIPE_MERCHANT_ID` | Identifiant Apple Pay |
| `EXPO_PUBLIC_API_TIMEOUT` | Timeout HTTP en ms (défaut 20000) |

Sans clé Stripe valide, `StripeProvider` n'est pas monté et l'écran de détail affiche
une erreur explicite au lieu de planter.

## Version web

Le même code produit une application web, servie par l'API elle-même :

```bash
EXPO_PUBLIC_API_BASE_URL=/api/v1 npx expo export --platform web --clear \
  --output-dir ../backend/webapp
```

Deux composants ne peuvent pas exister tels quels dans un navigateur et ont une
variante web :

- `@stripe/stripe-react-native` importe des modules internes de React Native
  absents du web — sa seule présence empêchait l'application de se construire.
  `shims/stripe-web.js` le remplace (substitution déclarée dans `metro.config.js`)
  et renvoie un message explicite : la feuille de paiement est native.
- `@react-native-community/datetimepicker` n'a aucune implémentation web.
  `DateTimeField.web.tsx` utilise le champ `datetime-local` du navigateur, qui
  ouvre au passage le sélecteur du système sur iOS et Android.

Le reste fonctionne à l'identique : comptes, séances, participation, avis.

## Structure

```
frontend/
├── app/                    # routes expo-router
│   ├── (auth)/             # signup, login, discharge (modale)
│   ├── (tabs)/             # home, sparrings, payments, profile
│   ├── sparring/           # [id] (détail), create (modale)
│   ├── _layout.tsx         # providers + garde d'authentification
│   └── index.tsx           # redirection selon la session
├── components/             # UI réutilisable (cartes, formulaires, états)
├── services/               # api, auth, sparring, payment, revenue, moderation
├── context/                # AuthContext, AppContext
├── store/                  # filtres et décharge (zustand)
├── constants/              # endpoints, config, thème
├── types/                  # interfaces du domaine
├── utils/                  # storage, cache, validation, formatage, normalisation
├── assets/                 # icône, splash, favicon
└── __tests__/              # tests unitaires et de composants
```

## Endpoints consommés

`POST /auth/signup` · `POST /auth/login` · `GET /auth/me` ·
`GET|POST /sparrings` · `GET /sparrings/{id}` · `POST /sparrings/{id}/join` ·
`POST /sparrings/{id}/cancel` · `GET /sparrings/{id}/reviews` ·
`POST /payments/create-intent` · `GET /payments/history` · `GET /revenue/stats` ·
`POST /moderation/reviews` · `GET /moderation/user-risk/{user_id}` ·
`GET /moderation/recommendations`

L'API correspondante vit dans [`../backend/`](../backend/). Le client accepte
malgré tout indifféremment `snake_case` et `camelCase`, les enveloppes
`{items|results|data}` ou un tableau nu, un prix en euros ou en centimes, et un `_id`
Mongo (`{"$oid": …}`) — voir `utils/normalize.ts` : cette tolérance permet de brancher
l'app sur une autre implémentation du même contrat sans toucher aux écrans.

## Comportements transverses

- **Auto-login** : le JWT est relu au démarrage ; un `401` sur n'importe quelle requête
  purge la session et renvoie vers l'écran de connexion.
- **Hors ligne** : `NetInfo` alimente un bandeau global ; sparrings, paiements et stats
  servent leur dernier cache disque plutôt qu'un écran vide.
- **Retry** : backoff exponentiel (2 tentatives) sur erreur réseau ou 5xx, uniquement
  sur les `GET` — rejouer un `POST` créerait un doublon ou un double débit.
- **États** : chaque écran gère chargement, erreur (avec relance) et vide.

## Qualité

105 tests répartis en 11 suites, tous verts :

| Suite | Ce qu'elle couvre |
| --- | --- |
| `validation` / `formatting` / `normalize` | règles de saisie, affichage FR, tolérance du contrat API |
| `api` | messages d'erreur FastAPI, et la politique de réessai (GET seulement) |
| `authService` | variantes de token, restauration hors ligne, purge sur 401 |
| `sparringService` | écriture et lecture du cache, filtrage local hors ligne, filtre organisateur |
| `AuthContext` | démarrage, connexion, déconnexion, 401 venu de l'intercepteur |
| `components` | `Button`, `SparringCard`, `RatingStars`, `UserProfile` |
| `PaymentForm` | PaymentIntent → Payment Sheet, annulation, carte refusée, clé absente |
| `loginScreen` | validation du formulaire et normalisation de l'email |
| `contract` | les normaliseurs face aux **vraies** réponses de l'API (voir ci-dessous) |

```bash
npm start           # serveur de développement Expo
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
npm test            # jest
npm run format      # prettier
npm run build:android / build:ios   # EAS (profil preview)
```

### Test de contrat

Les autres suites utilisent des payloads écrits à la main : ils décrivent ce que
l'on *croit* que l'API renvoie. `__tests__/contract.test.ts` fait tourner les
normaliseurs sur des réponses réellement capturées sur l'API de `backend/`,
tournant contre un vrai MongoDB. Un champ renommé côté serveur casse donc un
test, au lieu de casser en silence dans l'application.

Les fixtures se régénèrent depuis le backend :

```bash
cd backend && uvicorn app.main:app --port 8123      # dans un terminal
python scripts/capture_fixtures.py                   # dans un autre
```

La CI (`.github/workflows/frontend.yml`) rejoue lint, types, tests et un bundle
Metro Android à chaque push touchant `frontend/`.

## Builds iOS / Android

Les binaires passent par EAS et demandent un compte Expo — non exécutable ici :

```bash
npm install -g eas-cli
eas login
eas build:configure          # renseigne le projectId dans app.json
eas build --profile preview --platform android   # APK d'essai
eas build --profile preview --platform ios       # build simulateur
```

Les profils `development`, `preview` et `production` sont déjà définis dans `eas.json`.
Le `projectId` d'`app.json` est un espace réservé, remplacé par `eas build:configure`.
