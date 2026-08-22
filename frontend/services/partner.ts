import { CONFIG } from '@/constants/config';
import { ENDPOINTS, STORAGE_KEYS } from '@/constants/api';
import { http, isOnline } from '@/services/api';
import { cache } from '@/utils/cache';
import { extractList, extractTotal, normalizePartner } from '@/utils/normalize';
import type { Paginated, Partner, PartnerFilters } from '@/types';

interface ListOptions {
  page?: number;
  limit?: number;
  filters?: Partial<PartnerFilters>;
}

export interface ListResult extends Paginated<Partner> {
  /** Données issues du cache disque parce que le réseau était indisponible. */
  fromCache: boolean;
}

function buildParams(options: ListOptions): Record<string, string | number> {
  const { page = 1, limit = CONFIG.pageSize, filters } = options;
  const params: Record<string, string | number> = { page, limit };

  if (filters?.city?.trim()) params.city = filters.city.trim();
  if (filters?.level) params.level = filters.level;
  if (filters?.style) params.style = filters.style;
  if (filters?.weightClass) params.weight_class = filters.weightClass;

  return params;
}

/**
 * Filtrage de repli, appliqué uniquement aux données du cache.
 *
 * En ligne, c'est le serveur qui filtre ; hors ligne, on reproduit le même
 * comportement sur la dernière page mise en cache.
 */
function applyFiltersLocally(items: Partner[], filters?: Partial<PartnerFilters>): Partner[] {
  if (!filters) return items;
  const city = filters.city?.trim().toLowerCase() ?? '';

  return items.filter((item) => {
    if (city && !(item.city ?? '').toLowerCase().startsWith(city)) return false;
    if (filters.level && item.level !== filters.level) return false;
    if (filters.style && item.style !== filters.style) return false;
    if (filters.weightClass && item.weightClass !== filters.weightClass) return false;
    return true;
  });
}

export const partnerService = {
  async list(options: ListOptions = {}): Promise<ListResult> {
    const page = options.page ?? 1;
    const limit = options.limit ?? CONFIG.pageSize;

    if (!(await isOnline())) {
      return partnerService.readCache(options);
    }

    try {
      const payload = await http.get<unknown>(ENDPOINTS.partners.list, {
        params: buildParams(options),
      });
      const items = extractList(payload).map(normalizePartner);
      const total = extractTotal(payload, (page - 1) * limit + items.length);

      // Seule la première page non filtrée sert de cache hors ligne : une liste
      // restreinte écraserait le cache général avec un sous-ensemble.
      if (page === 1 && !options.filters) {
        await cache.write(STORAGE_KEYS.partnersCache, items);
      }

      return { items, page, limit, total, hasMore: items.length >= limit, fromCache: false };
    } catch (error) {
      const fallback = await partnerService.readCache(options);
      if (fallback.items.length > 0) return fallback;
      throw error;
    }
  },

  async readCache(options: ListOptions = {}): Promise<ListResult> {
    // Le cache ne contient que la première page : la pagination y est désactivée.
    const limit = options.limit ?? CONFIG.pageSize;
    const cached = await cache.read<Partner[]>(STORAGE_KEYS.partnersCache);
    const items = applyFiltersLocally(cached?.payload ?? [], options.filters);

    return { items, page: 1, limit, total: items.length, hasMore: false, fromCache: true };
  },

  async detail(id: string): Promise<Partner> {
    const payload = await http.get<unknown>(ENDPOINTS.partners.detail(id));
    return normalizePartner(payload);
  },

  async recommendations(): Promise<Partner[]> {
    const payload = await http.get<unknown>(ENDPOINTS.moderation.recommendations);
    return extractList(payload).map(normalizePartner);
  },
};
