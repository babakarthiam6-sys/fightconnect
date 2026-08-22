import { ENDPOINTS } from '@/constants/api';
import { http } from '@/services/api';
import {
  extractList,
  normalizePartner,
  normalizeReview,
  normalizeUserRisk,
} from '@/utils/normalize';
import type { Partner, Review, UserRiskProfile } from '@/types';
import type { ReviewInput } from '@/utils/validation';

export const moderationService = {
  /**
   * Poste un avis. Le serveur le passe à la modération OpenAI et peut renvoyer
   * l'avis avec `flagged: true` — ce n'est pas une erreur, l'interface affiche
   * alors un badge de signalement.
   */
  async postReview(bookingId: string, input: ReviewInput): Promise<Review> {
    const payload = await http.post<unknown>(ENDPOINTS.moderation.reviews, {
      booking_id: bookingId,
      rating: input.rating,
      comment: input.comment,
    });
    return normalizeReview(payload);
  },

  async listReviews(bookingId: string): Promise<Review[]> {
    const payload = await http.get<unknown>(ENDPOINTS.bookings.reviews(bookingId));
    return extractList(payload).map(normalizeReview);
  },

  async userRisk(userId: string): Promise<UserRiskProfile | null> {
    try {
      const payload = await http.get<unknown>(ENDPOINTS.moderation.userRisk(userId));
      return normalizeUserRisk(payload);
    } catch {
      // Profil de risque indisponible : l'écran s'affiche simplement sans badge.
      return null;
    }
  },

  async recommendations(): Promise<Partner[]> {
    try {
      const payload = await http.get<unknown>(ENDPOINTS.moderation.recommendations);
      return extractList(payload).map(normalizePartner);
    } catch {
      return [];
    }
  },
};
