import Constants from 'expo-constants';
import { Platform } from 'react-native';

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

const DEFAULT_API_BASE_URL = 'https://fightconnect-production.up.railway.app/api/v1';

interface ApiBaseSources {
  /** `EXPO_PUBLIC_API_BASE_URL`, inlinée par Metro à la compilation. */
  envValue?: string;
  platformOS: string;
  /** `window.location.origin`, absent hors navigateur. */
  origin?: string;
  /** `app.json > extra > apiBaseUrl`, filet pour les builds natifs. */
  extraValue?: string;
}

/**
 * Choisit l'URL de base de l'API.
 *
 * Sur le web, l'export est servi par l'API elle-même, au même hôte : viser cette
 * origine plutôt qu'un domaine écrit en dur rend le bundle indépendant de
 * l'adresse de déploiement. Un domaine figé casse silencieusement toute
 * l'application dès que l'hébergeur en attribue un autre — la page s'affiche,
 * mais aucune requête n'aboutit, et rien dans l'interface ne dit pourquoi.
 *
 * `EXPO_PUBLIC_API_BASE_URL` reste prioritaire : c'est ce qui permet de pointer
 * un build web vers une API distincte, en développement par exemple.
 */
export function resolveApiBaseUrl({
  envValue,
  platformOS,
  origin,
  extraValue,
}: ApiBaseSources): string {
  const sameOrigin = platformOS === 'web' && origin ? `${origin}/api/v1` : undefined;
  const chosen = envValue || sameOrigin || extraValue || DEFAULT_API_BASE_URL;
  return chosen.replace(/\/+$/, '');
}

/** URL de base de l'API, sans slash final. */
export const API_BASE_URL = resolveApiBaseUrl({
  envValue: process.env.EXPO_PUBLIC_API_BASE_URL,
  platformOS: Platform.OS,
  origin: typeof window !== 'undefined' ? window.location?.origin : undefined,
  extraValue: readExtra('apiBaseUrl'),
});

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
  /**
   * Part de la plateforme, prélevée sur le versement au partenaire.
   *
   * Recopiée depuis `backend/app/config.py` : l'écran de réservation affiche le
   * décompte **avant** que la demande n'existe côté serveur, il n'a donc rien à
   * interroger. `__tests__/commission.test.ts` échoue si les deux valeurs
   * divergent — un décompte annoncé puis démenti à la facturation est la pire
   * des surprises.
   */
  commissionRate: 0.15,
  /**
   * Plafond de la galerie vidéo, repris de `MAX_VIDEOS` côté serveur.
   *
   * Dupliqué parce que l'écran doit savoir masquer la case « Ajouter » avant
   * d'envoyer quoi que ce soit : proposer un formulaire pour le voir refusé est
   * une promesse non tenue. Le serveur reste seul juge — si les deux valeurs
   * divergent, l'ajout est refusé proprement, pas accepté à tort.
   */
  maxVideos: 6,
  /** Durée de validité du cache hors ligne. */
  cacheTtlMs: 1000 * 60 * 30,
  /** Nombre de tentatives supplémentaires sur erreur réseau ou 5xx. */
  maxRetries: 2,
  retryBaseDelayMs: 600,
  minPasswordLength: 8,
  maxReviewLength: 1000,
} as const;
