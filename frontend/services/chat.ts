import { ENDPOINTS } from '@/constants/api';
import { http } from '@/services/api';
import { extractList, normalizeConversation, normalizeMessage } from '@/utils/normalize';
import type { Conversation, Message } from '@/types';

export const chatService = {
  async conversations(): Promise<Conversation[]> {
    const payload = await http.get<unknown>(ENDPOINTS.chat.conversations);
    return extractList(payload).map(normalizeConversation);
  },

  /** Ouvre un fil. Le serveur en profite pour marquer les messages comme lus. */
  async history(otherId: string): Promise<Message[]> {
    const payload = await http.get<unknown>(ENDPOINTS.chat.history(otherId));
    return extractList(payload).map(normalizeMessage);
  },

  /**
   * Enregistre le jeton de l'appareil pour les notifications.
   *
   * Ne rejette jamais : ne pas recevoir de notification est un désagrément,
   * échouer à ouvrir l'application en serait un autre.
   */
  async registerPushToken(token: string | null): Promise<void> {
    try {
      await http.put(ENDPOINTS.chat.pushToken, { expo_push_token: token });
    } catch {
      // Silencieux à dessein.
    }
  },
};
