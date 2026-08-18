import { CONFIG } from '@/constants/config';
import { ENDPOINTS, STORAGE_KEYS } from '@/constants/api';
import { http, isOnline } from '@/services/api';
import { cache } from '@/utils/cache';
import { extractList, extractTotal, normalizeSparring } from '@/utils/normalize';
import type { Paginated, Sparring, SparringFilters } from '@/types';
import type { SparringInput } from '@/utils/validation';

interface ListOptions {
  page?: number;
  limit?: number;
  filters?: Partial<SparringFilters>;
}

export interface ListResult extends Paginated<Sparring> {
  /** Données issues du cache disque parce que le réseau était indisponible. */
  fromCache: boolean;
}

function buildParams(options: ListOptions): Record<string, string | number> {
  const { page = 1, limit = CONFIG.pageSize, filters } = options;
  const params: Record<string, string | number> = { page, limit, skip: (page - 1) * limit };

  if (filters?.search) params.search = filters.search;
  if (filters?.level) params.level = filters.level;
  if (filters?.style) params.style = filters.style;
  if (typeof filters?.minPrice === 'number') params.min_price = filters.minPrice;
  if (typeof filters?.maxPrice === 'number') params.max_price = filters.maxPrice;

  return params;
}

/**
 * Filtrage de repli, appliqué uniquement aux données du cache.
 *
 * En ligne, c'est le backend qui filtre ; hors ligne, on reproduit le même
 * comportement sur la dernière page mise en cache.
 */
function applyFiltersLocally(items: Sparring[], filters?: Partial<SparringFilters>): Sparring[] {
  if (!filters) return items;
  const search = filters.search?.trim().toLowerCase() ?? '';

  return items.filter((item) => {
    if (search && !`${item.title} ${item.location} ${item.description}`.toLowerCase().includes(search)) {
      return false;
    }
    if (filters.level && item.level !== filters.level) return false;
    if (filters.style && item.style !== filters.style) return false;
    if (typeof filters.minPrice === 'number' && item.price < filters.minPrice) return false;
    if (typeof filters.maxPrice === 'number' && item.price > filters.maxPrice) return false;
    return true;
  });
}

export const sparringService = {
  async list(options: ListOptions = {}): Promise<ListResult> {
    const page = options.page ?? 1;
    const limit = options.limit ?? CONFIG.pageSize;

    if (!(await isOnline())) {
      return sparringService.readCache(options);
    }

    try {
      const payload = await http.get<unknown>(ENDPOINTS.sparrings.list, {
        params: buildParams(options),
      });
      const items = extractList(payload).map(normalizeSparring);
      const total = extractTotal(payload, (page - 1) * limit + items.length);

      // Seule la première page non filtrée sert de cache hors ligne.
      if (page === 1 && !options.filters) {
        await cache.write(STORAGE_KEYS.sparringsCache, items);
      }

      return { items, page, limit, total, hasMore: items.length >= limit, fromCache: false };
    } catch (error) {
      const fallback = await sparringService.readCache(options);
      if (fallback.items.length > 0) return fallback;
      throw error;
    }
  },

  async readCache(options: ListOptions = {}): Promise<ListResult> {
    const page = options.page ?? 1;
    const limit = options.limit ?? CONFIG.pageSize;
    const cached = await cache.read<Sparring[]>(STORAGE_KEYS.sparringsCache);
    const items = applyFiltersLocally(cached?.payload ?? [], options.filters);

    return { items, page: 1, limit, total: items.length, hasMore: false, fromCache: true };
  },

  async detail(id: string): Promise<Sparring> {
    const payload = await http.get<unknown>(ENDPOINTS.sparrings.detail(id));
    return normalizeSparring(payload);
  },

  async create(input: SparringInput): Promise<Sparring> {
    const payload = await http.post<unknown>(ENDPOINTS.sparrings.create, {
      title: input.title,
      description: input.description,
      location: input.location,
      scheduled_at: input.scheduledAt,
      duration_minutes: input.durationMinutes,
      level: input.level,
      style: input.style,
      price: input.price,
      max_participants: input.maxParticipants,
    });
    return normalizeSparring(payload);
  },

  async join(id: string): Promise<Sparring | null> {
    const payload = await http.post<unknown>(ENDPOINTS.sparrings.join(id));
    // L'API peut répondre 204 sans corps : on renvoie null, l'écran rechargera.
    return payload ? normalizeSparring(payload) : null;
  },

  async cancel(id: string): Promise<void> {
    await http.post(ENDPOINTS.sparrings.cancel(id));
  },
};
