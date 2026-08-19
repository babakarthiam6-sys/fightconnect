import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Fine couche typée au-dessus d'AsyncStorage.
 *
 * Toutes les méthodes échouent en silence (retour `null` / `false`) : un
 * stockage local indisponible ne doit jamais faire planter un écran.
 */
export const storage = {
  async getString(key: string): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },

  async setString(key: string, value: string): Promise<boolean> {
    try {
      await AsyncStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },

  async getObject<T>(key: string): Promise<T | null> {
    const raw = await storage.getString(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Valeur corrompue : on la purge pour éviter de relire une donnée illisible.
      await storage.remove(key);
      return null;
    }
  },

  async setObject(key: string, value: unknown): Promise<boolean> {
    try {
      return await storage.setString(key, JSON.stringify(value));
    } catch {
      return false;
    }
  },

  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // ignoré volontairement
    }
  },

  async removeMany(keys: string[]): Promise<void> {
    try {
      await AsyncStorage.multiRemove(keys);
    } catch {
      // ignoré volontairement
    }
  },
};
