import Constants from 'expo-constants';

/**
 * Lit une variable d'environnement Expo.
 *
 * Les variables `EXPO_PUBLIC_*` sont inlinées au build ; on retombe sur
 * `app.json > extra` puis sur la valeur par défaut pour qu'un `expo start` sans
 * fichier `.env` reste fonctionnel.
 */
function readEnv(key: string, fallback: string): string {
  const fromProcess = process.env[key];
  if (typeof fromProcess === 'string' && fromProcess.length > 0) return fromProcess;

  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const fromExtra = extra?.[key];
  if (typeof fromExtra === 'string' && fromExtra.length > 0) return fromExtra;

  return fallback;
}

const DEFAULT_API_BASE_URL = 'https://fightconnect-prod.up.railway.app/api/v1';

/** URL de base de l'API, sans slash final. */
export const API_BASE_URL = readEnv('EXPO_PUBLIC_API_BASE_URL', DEFAULT_API_BASE_URL).replace(
  /\/+$/,
  '',
);

export const STRIPE_PUBLISHABLE_KEY = readEnv('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY', '');

export const STRIPE_MERCHANT_ID = readEnv(
  'EXPO_PUBLIC_STRIPE_MERCHANT_ID',
  'merchant.com.fightconnect.app',
);

export const API_TIMEOUT_MS = Number(readEnv('EXPO_PUBLIC_API_TIMEOUT', '20000')) || 20000;

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
