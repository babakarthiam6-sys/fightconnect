import { ENDPOINTS } from '@/constants/api';
import { http } from '@/services/api';
import {
  extractList,
  normalizeReview,
  normalizeSparring,
  normalizeUserRisk,
} from '@/utils/normalize';
import type { Review, Sparring, UserRiskProfile } from '@/types';
import type { ReviewInput } from '@/utils/validation';

export const moderationService = {
  /**
   * Poste un avis. Le backend le passe à la modération OpenAI et peut renvoyer
   * l'avis avec `flagged: true` — ce n'est pas une erreur, l'UI affiche alors
   * un badge de signalement.
   */
  async postReview(sparringId: string, input: ReviewInput): Promise<Review> {
    const payload = await http.post<unknown>(ENDPOINTS.moderation.reviews, {
      sparring_id: sparringId,
      rating: input.rating,
      comment: input.comment,
    });
    return normalizeReview(payload);
  },

  async listReviews(sparringId: string): Promise<Review[]> {
    const payload = await http.get<unknown>(ENDPOINTS.sparrings.reviews(sparringId));
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

  async recommendations(): Promise<Sparring[]> {
    try {
      const payload = await http.get<unknown>(ENDPOINTS.moderation.recommendations);
      return extractList(payload).map(normalizeSparring);
    } catch {
      return [];
    }
  },
};
