import { ENDPOINTS } from '@/constants/api';
import { http } from '@/services/api';
import { asRecord, normalizeId } from '@/utils/normalize';

/** Motifs proposés au signalement, en miroir de `backend/app/routers/securite.py`. */
export const MOTIFS = [
  'harcelement',
  'contenu_haineux',
  'arnaque',
  'hors_plateforme',
  'autre',
] as const;

export type Motif = (typeof MOTIFS)[number];
export type CibleSignalement = 'user' | 'message' | 'review';

export interface PersonneBloquee {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
}

/**
 * Signalement et blocage.
 *
 * Deux gestes que les magasins d'applications exigent de toute application où
 * les gens s'écrivent, et qui ne font pas la même chose : signaler demande à la
 * plateforme de regarder, bloquer décide tout de suite et sans recours.
 */
export const securiteService = {
  async signaler(
    cible: CibleSignalement,
    id: string,
    motif: Motif,
    details?: string,
  ): Promise<void> {
    await http.post(ENDPOINTS.securite.reports, {
      target_type: cible,
      target_id: id,
      reason: motif,
      details: details?.trim() || undefined,
    });
  },

  async bloquer(userId: string): Promise<void> {
    await http.post(ENDPOINTS.securite.block(userId));
  },

  async debloquer(userId: string): Promise<void> {
    await http.delete(ENDPOINTS.securite.block(userId));
  },

  async listeDesBlocages(): Promise<PersonneBloquee[]> {
    const payload = await http.get<unknown>(ENDPOINTS.securite.blocks);
    const items = asRecord(payload)['items'];
    if (!Array.isArray(items)) return [];
    return items.map((item) => {
      const brut = asRecord(item);
      return {
        id: normalizeId(brut),
        firstName: String(brut['first_name'] ?? ''),
        lastName: String(brut['last_name'] ?? ''),
        avatarUrl: (brut['avatar_url'] as string | null) ?? null,
      };
    });
  },
};

export default securiteService;
