import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';
import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

import { API_BASE_URL, API_TIMEOUT_MS, CONFIG } from '@/constants/config';
import { STORAGE_KEYS } from '@/constants/api';
import { storage } from '@/utils/storage';
import { asRecord } from '@/utils/normalize';
import type { AppError } from '@/types';

/** Token gardé en mémoire pour éviter un accès disque à chaque requête. */
let authToken: string | null = null;

/** Appelé quand le serveur répond 401 : l'AuthContext s'y abonne pour déconnecter. */
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

/** Recharge le token depuis le disque (auto-login au démarrage). */
export async function restoreAuthToken(): Promise<string | null> {
  authToken = await storage.getString(STORAGE_KEYS.token);
  return authToken;
}

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (authToken) {
    config.headers.set('Authorization', `Bearer ${authToken}`);
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && authToken !== null) {
      // Token expiré ou révoqué : on purge la session côté app.
      onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);

export async function isOnline(): Promise<boolean> {
  // Sur le web, c'est le navigateur qui sait. NetInfo y devine la connectivité
  // avec un `HEAD /` qu'il annule parfois ; il rapporte alors une coupure qui
  // n'existe pas. Constaté sur la production : environ un chargement sur cinq
  // de l'écran de recherche affichait « Mode hors ligne — données en cache. »
  // sans avoir passé le moindre appel à l'API.
  if (Platform.OS === 'web') {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
  }

  try {
    const state = await NetInfo.fetch();
    // `isInternetReachable` vaut null tant que la sonde n'a pas abouti : dans ce
    // cas on fait confiance à `isConnected` plutôt que de bloquer la requête.
    return state.isConnected === true && state.isInternetReachable !== false;
  } catch {
    return true;
  }
}

function extractFieldErrors(payload: unknown): Record<string, string> | null {
  // FastAPI renvoie `detail: [{ loc: ["body", "email"], msg: "..." }]` en 422.
  const detail = asRecord(payload)['detail'];
  if (!Array.isArray(detail)) return null;

  const errors: Record<string, string> = {};
  for (const item of detail) {
    const entry = asRecord(item);
    const loc = entry['loc'];
    const msg = entry['msg'];
    if (!Array.isArray(loc) || typeof msg !== 'string') continue;
    const field = loc[loc.length - 1];
    if (typeof field === 'string' && !(field in errors)) {
      errors[field] = msg;
    }
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

function extractMessage(payload: unknown, status: number | null): string {
  const raw = asRecord(payload);
  const detail = raw['detail'];
  if (typeof detail === 'string' && detail.length > 0) return detail;

  for (const key of ['message', 'error', 'msg']) {
    const value = raw[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }

  if (status === 401) return 'Session expirée, reconnectez-vous.';
  if (status === 403) return 'Accès refusé.';
  if (status === 404) return 'Ressource introuvable.';
  if (status === 409) return 'Cette action a déjà été effectuée.';
  if (status !== null && status >= 500) return 'Le serveur rencontre un problème. Réessayez.';
  return 'Une erreur est survenue.';
}

/** Convertit n'importe quel rejet en `AppError` : les écrans n'ont qu'un cas à gérer. */
export function toAppError(error: unknown): AppError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? null;
    const isNetworkError =
      status === null && (error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK' || !error.response);

    if (isNetworkError) {
      return {
        message:
          error.code === 'ECONNABORTED'
            ? 'Le serveur met trop de temps à répondre.'
            : 'Pas de connexion. Vérifiez votre réseau.',
        status: null,
        isNetworkError: true,
        fieldErrors: null,
      };
    }

    return {
      message: extractMessage(error.response?.data, status),
      status,
      isNetworkError: false,
      fieldErrors: extractFieldErrors(error.response?.data),
    };
  }

  if (error instanceof Error) {
    return { message: error.message, status: null, isNetworkError: false, fieldErrors: null };
  }

  return {
    message: 'Une erreur inattendue est survenue.',
    status: null,
    isNetworkError: false,
    fieldErrors: null,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(error: AppError, method: string): boolean {
  // On ne rejoue que ce qui est idempotent : rejouer un POST risquerait de
  // créer deux demandes ou de débiter deux fois.
  if (method.toLowerCase() !== 'get') return false;
  return error.isNetworkError || (error.status !== null && error.status >= 500);
}

/**
 * Exécute une requête avec backoff exponentiel sur les erreurs transitoires.
 *
 * Rejette toujours un `AppError`, jamais une `AxiosError` brute.
 */
export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const method = config.method ?? 'get';
  let lastError: AppError | null = null;

  for (let attempt = 0; attempt <= CONFIG.maxRetries; attempt += 1) {
    try {
      const response = await api.request<T>(config);
      return response.data;
    } catch (error) {
      lastError = toAppError(error);
      if (attempt === CONFIG.maxRetries || !shouldRetry(lastError, method)) break;
      await delay(CONFIG.retryBaseDelayMs * 2 ** attempt);
    }
  }

  throw lastError ?? toAppError(new Error('Requête échouée.'));
}

export const http = {
  get: <T>(url: string, config?: AxiosRequestConfig) =>
    request<T>({ ...config, url, method: 'get' }),
  post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, url, method: 'post', data }),
  put: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, url, method: 'put', data }),
  patch: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, url, method: 'patch', data }),
  delete: <T>(url: string, config?: AxiosRequestConfig) =>
    request<T>({ ...config, url, method: 'delete' }),
};
