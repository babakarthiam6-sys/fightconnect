import { ENDPOINTS, STORAGE_KEYS } from '@/constants/api';
import { http, isOnline } from '@/services/api';
import { cache } from '@/utils/cache';
import { extractList, normalizePayment, normalizePaymentIntent } from '@/utils/normalize';
import type { Payment, PaymentIntent } from '@/types';

export interface HistoryResult {
  items: Payment[];
  fromCache: boolean;
}

export const paymentService = {
  /** Crée le PaymentIntent côté backend ; la clé secrète ne transite jamais ici. */
  async createIntent(bookingId: string): Promise<PaymentIntent> {
    const payload = await http.post<unknown>(ENDPOINTS.payments.createIntent, {
      booking_id: bookingId,
    });
    const intent = normalizePaymentIntent(payload);

    if (!intent.clientSecret) {
      throw {
        message: 'Le serveur n’a pas renvoyé de client_secret Stripe.',
        status: null,
        isNetworkError: false,
        fieldErrors: null,
      };
    }
    return intent;
  },

  async history(): Promise<HistoryResult> {
    if (!(await isOnline())) {
      const cached = await cache.read<Payment[]>(STORAGE_KEYS.paymentsCache);
      return { items: cached?.payload ?? [], fromCache: true };
    }

    try {
      const payload = await http.get<unknown>(ENDPOINTS.payments.history);
      const items = extractList(payload).map(normalizePayment);
      await cache.write(STORAGE_KEYS.paymentsCache, items);
      return { items, fromCache: false };
    } catch (error) {
      const cached = await cache.read<Payment[]>(STORAGE_KEYS.paymentsCache);
      if (cached && cached.payload.length > 0) return { items: cached.payload, fromCache: true };
      throw error;
    }
  },
};
