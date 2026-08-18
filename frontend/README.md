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
| Tests | `jest-expo` |

## Démarrage

```bash
cd frontend
npm install
cp .env.example .env      # renseignez l'URL de l'API et la clé publique Stripe
npx expo start            # puis scannez le QR code avec Expo Go
```

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
└── __tests__/              # tests unitaires
```

## Endpoints consommés

`POST /auth/signup` · `POST /auth/login` · `GET /auth/me` ·
`GET|POST /sparrings` · `GET /sparrings/{id}` · `POST /sparrings/{id}/join` ·
`POST /sparrings/{id}/cancel` · `GET /sparrings/{id}/reviews` ·
`POST /payments/create-intent` · `GET /payments/history` · `GET /revenue/stats` ·
`POST /moderation/reviews` · `GET /moderation/user-risk/{user_id}` ·
`GET /moderation/recommendations`

Le client accepte indifféremment `snake_case` et `camelCase`, les enveloppes
`{items|results|data}` ou un tableau nu, un prix en euros ou en centimes, et un `_id`
Mongo (`{"$oid": …}`) — voir `utils/normalize.ts`. Deux routes ne figuraient pas dans
la spécification initiale et sont supposées : `POST /sparrings/{id}/cancel`
(annulation de participation) et `GET /sparrings/{id}/reviews` (liste des avis).
Un échec sur ces deux-là est absorbé sans casser l'écran.

## Comportements transverses

- **Auto-login** : le JWT est relu au démarrage ; un `401` sur n'importe quelle requête
  purge la session et renvoie vers l'écran de connexion.
- **Hors ligne** : `NetInfo` alimente un bandeau global ; sparrings, paiements et stats
  servent leur dernier cache disque plutôt qu'un écran vide.
- **Retry** : backoff exponentiel (2 tentatives) sur erreur réseau ou 5xx, uniquement
  sur les `GET` — rejouer un `POST` créerait un doublon ou un double débit.
- **États** : chaque écran gère chargement, erreur (avec relance) et vide.

## Scripts

```bash
npm start           # serveur de développement Expo
npm run typecheck   # tsc --noEmit
npm test            # jest
npm run build:android / build:ios   # EAS (profil preview)
```
