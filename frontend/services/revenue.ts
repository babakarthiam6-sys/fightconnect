import { ENDPOINTS, STORAGE_KEYS } from '@/constants/api';
import { http, isOnline } from '@/services/api';
import { cache } from '@/utils/cache';
import { normalizeRevenueStats } from '@/utils/normalize';
import type { RevenueStats } from '@/types';

const EMPTY_STATS: RevenueStats = {
  totalEarnings: 0,
  balance: 0,
  completedSparrings: 0,
  totalSparrings: 0,
  averageRating: null,
  currency: 'EUR',
};

export const revenueService = {
  /**
   * Statistiques du tableau de bord.
   *
   * Ne rejette jamais : l'accueil doit s'afficher même si l'endpoint est en
   * panne. Un cache vide se traduit par des compteurs à zéro.
   */
  async stats(): Promise<{ stats: RevenueStats; fromCache: boolean }> {
    if (!(await isOnline())) {
      const cached = await cache.read<RevenueStats>(STORAGE_KEYS.statsCache);
      return { stats: cached?.payload ?? EMPTY_STATS, fromCache: true };
    }

    try {
      const payload = await http.get<unknown>(ENDPOINTS.revenue.stats);
      const stats = normalizeRevenueStats(payload);
      await cache.write(STORAGE_KEYS.statsCache, stats);
      return { stats, fromCache: false };
    } catch {
      const cached = await cache.read<RevenueStats>(STORAGE_KEYS.statsCache);
      return { stats: cached?.payload ?? EMPTY_STATS, fromCache: true };
    }
  },
};
