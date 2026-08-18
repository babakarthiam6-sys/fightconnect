import { CONFIG } from '@/constants/config';
import { storage } from '@/utils/storage';

interface CacheEnvelope<T> {
  savedAt: number;
  payload: T;
}

export interface CachedValue<T> {
  payload: T;
  savedAt: number;
  isStale: boolean;
}

/**
 * Cache disque simple, utilisé quand l'appareil est hors ligne.
 *
 * On renvoie même les entrées périmées (`isStale: true`) : mieux vaut afficher
 * une liste datée avec un bandeau « hors ligne » qu'un écran vide.
 */
export const cache = {
  async read<T>(key: string, ttlMs: number = CONFIG.cacheTtlMs): Promise<CachedValue<T> | null> {
    const envelope = await storage.getObject<CacheEnvelope<T>>(key);
    if (!envelope || typeof envelope.savedAt !== 'number') return null;

    return {
      payload: envelope.payload,
      savedAt: envelope.savedAt,
      isStale: Date.now() - envelope.savedAt > ttlMs,
    };
  },

  async write<T>(key: string, payload: T): Promise<void> {
    await storage.setObject(key, { savedAt: Date.now(), payload } satisfies CacheEnvelope<T>);
  },

  async clear(keys: string[]): Promise<void> {
    await storage.removeMany(keys);
  },
};
