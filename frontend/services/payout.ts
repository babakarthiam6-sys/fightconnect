import { ENDPOINTS } from '@/constants/api';
import { http } from '@/services/api';
import { asRecord, normalizePayoutStatus } from '@/utils/normalize';
import type { PayoutStatus } from '@/types';

const UNAVAILABLE: PayoutStatus = {
  connected: false,
  detailsSubmitted: false,
  payoutsEnabled: false,
  stripeConfigured: false,
};

export const payoutService = {
  /**
   * État du compte de versement.
   *
   * Ne rejette jamais : l'écran Profil doit rester lisible même si cette
   * information manque. Un état inconnu s'affiche comme « non configuré ».
   */
  async status(): Promise<PayoutStatus> {
    try {
      return normalizePayoutStatus(await http.get<unknown>(ENDPOINTS.payouts.status));
    } catch {
      return UNAVAILABLE;
    }
  },

  /**
   * Lien d'inscription Stripe, à ouvrir dans un navigateur.
   *
   * Le lien expire en quelques minutes : il est demandé au moment du clic, et
   * jamais conservé.
   */
  async onboardingUrl(): Promise<string> {
    const payload = await http.post<unknown>(ENDPOINTS.payouts.onboarding);
    const url = asRecord(payload)['url'];

    if (typeof url !== 'string' || !url.startsWith('http')) {
      throw {
        message: 'Le serveur n’a pas renvoyé de lien Stripe valide.',
        status: null,
        isNetworkError: false,
        fieldErrors: null,
      };
    }

    return url;
  },
};
