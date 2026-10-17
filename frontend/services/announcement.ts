import { CONFIG } from '@/constants/config';
import { ENDPOINTS } from '@/constants/api';
import { http } from '@/services/api';
import { extractList, extractTotal, normalizeAnnouncement } from '@/utils/normalize';
import type { Announcement, AnnouncementDraft, AnnouncementFilters, Paginated } from '@/types';

interface ListOptions {
  page?: number;
  limit?: number;
  filters?: Partial<AnnouncementFilters>;
}

export function buildAnnouncementParams(options: ListOptions): Record<string, string | number> {
  const { page = 1, limit = CONFIG.pageSize, filters } = options;
  const params: Record<string, string | number> = { page, limit };

  if (filters?.kind) params.kind = filters.kind;
  if (filters?.style) params.style = filters.style;
  if (filters?.city?.trim()) params.city = filters.city.trim();

  return params;
}

/** Corps envoyé à l'API : snake_case, champs vides omis plutôt qu'envoyés à blanc. */
export function toAnnouncementPayload(draft: AnnouncementDraft): Record<string, unknown> {
  const optional = (value: string | null) => (value && value.trim() ? value.trim() : undefined);
  const fight = draft.kind === 'fight';

  return {
    kind: draft.kind,
    style: draft.style,
    city: draft.city.trim(),
    level: draft.level ?? undefined,
    weight_class: draft.weightClass ?? undefined,
    scheduled_for: draft.scheduledFor ?? undefined,
    message: draft.message.trim(),
    video_url: optional(draft.videoUrl),
    // Le serveur ignore ces champs pour un sparring ; autant ne pas les envoyer.
    fighter_name: fight ? optional(draft.fighterName) : undefined,
    fighter_record: fight ? optional(draft.fighterRecord) : undefined,
    weight_kg: fight && draft.weightKg != null ? draft.weightKg : undefined,
  };
}

/**
 * Annonces. Pas de cache hors ligne : une annonce vieillit vite, et répondre à
 * une annonce déjà pourvue serait pire que de ne rien afficher.
 */
export const announcementService = {
  async list(options: ListOptions = {}): Promise<Paginated<Announcement>> {
    const page = options.page ?? 1;
    const limit = options.limit ?? CONFIG.pageSize;
    const payload = await http.get<unknown>(ENDPOINTS.announcements.list, {
      params: buildAnnouncementParams(options),
    });
    const items = extractList(payload).map(normalizeAnnouncement);
    const total = extractTotal(payload, (page - 1) * limit + items.length);
    return { items, page, limit, total, hasMore: page * limit < total };
  },

  async mine(): Promise<Announcement[]> {
    const payload = await http.get<unknown>(ENDPOINTS.announcements.mine);
    return extractList(payload).map(normalizeAnnouncement);
  },

  async detail(id: string): Promise<Announcement> {
    return normalizeAnnouncement(await http.get<unknown>(ENDPOINTS.announcements.detail(id)));
  },

  async create(draft: AnnouncementDraft): Promise<Announcement> {
    const payload = await http.post<unknown>(
      ENDPOINTS.announcements.create,
      toAnnouncementPayload(draft),
    );
    return normalizeAnnouncement(payload);
  },

  async reply(id: string, message: string): Promise<Announcement> {
    const payload = await http.post<unknown>(ENDPOINTS.announcements.replies(id), {
      message: message.trim(),
    });
    return normalizeAnnouncement(payload);
  },

  async close(id: string): Promise<Announcement> {
    return normalizeAnnouncement(await http.post<unknown>(ENDPOINTS.announcements.close(id)));
  },

  async remove(id: string): Promise<void> {
    await http.delete<unknown>(ENDPOINTS.announcements.remove(id));
  },
};
