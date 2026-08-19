import Constants from 'expo-constants';

/**
 * Configuration issue de l'environnement.
 *
 * Les variables `EXPO_PUBLIC_*` sont **inlinées statiquement** par Metro : elles
 * doivent être référencées littéralement (`process.env.EXPO_PUBLIC_X`). Un accès
 * dynamique (`process.env[key]`) renvoie `undefined` dans le bundle, et la
 * configuration retomberait silencieusement sur ses valeurs par défaut.
 */
function readExtra(key: string): string | undefined {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const value = extra?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Ordre de priorité : variable d'environnement, puis `app.json > extra`, puis défaut. */
function resolve(inlined: string | undefined, extraKey: string, fallback: string): string {
  if (typeof inlined === 'string' && inlined.length > 0) return inlined;
  return readExtra(extraKey) ?? fallback;
}

const DEFAULT_API_BASE_URL = 'https://fightconnect-prod.up.railway.app/api/v1';

/** URL de base de l'API, sans slash final. */
export const API_BASE_URL = resolve(
  process.env.EXPO_PUBLIC_API_BASE_URL,
  'apiBaseUrl',
  DEFAULT_API_BASE_URL,
).replace(/\/+$/, '');

export const STRIPE_PUBLISHABLE_KEY = resolve(
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  'stripePublishableKey',
  '',
);

export const STRIPE_MERCHANT_ID = resolve(
  process.env.EXPO_PUBLIC_STRIPE_MERCHANT_ID,
  'stripeMerchantId',
  'merchant.com.fightconnect.app',
);

export const API_TIMEOUT_MS =
  Number(resolve(process.env.EXPO_PUBLIC_API_TIMEOUT, 'apiTimeout', '20000')) || 20000;

/** Stripe est utilisable seulement si une clé publique est fournie. */
export const IS_STRIPE_CONFIGURED = STRIPE_PUBLISHABLE_KEY.startsWith('pk_');

export const CONFIG = {
  pageSize: 20,
  /** Durée de validité du cache hors ligne. */
  cacheTtlMs: 1000 * 60 * 30,
  /** Nombre de tentatives supplémentaires sur erreur réseau ou 5xx. */
  maxRetries: 2,
  retryBaseDelayMs: 600,
  minPasswordLength: 8,
  maxReviewLength: 1000,
} as const;
