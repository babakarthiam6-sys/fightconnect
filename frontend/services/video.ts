import { ENDPOINTS } from '@/constants/api';
import { http } from '@/services/api';
import { normalizeVideos } from '@/utils/normalize';
import type { ProfileVideo, VideoKind } from '@/types';

interface AddInput {
  url: string;
  kind: VideoKind;
  caption?: string | null;
}

/**
 * Galerie vidéo du profil connecté.
 *
 * Chaque appel renvoie la galerie entière plutôt que l'élément touché : l'écran
 * l'affiche en grille, et recoller un élément dans une liste tenue localement
 * finit toujours par diverger de ce que le serveur a réellement enregistré.
 */
export const videoService = {
  async add(input: AddInput): Promise<ProfileVideo[]> {
    const payload = await http.post<unknown>(ENDPOINTS.videos.add, {
      url: input.url.trim(),
      kind: input.kind,
      caption: input.caption?.trim() || null,
    });
    return normalizeVideos(payload);
  },

  async remove(id: string): Promise<ProfileVideo[]> {
    const payload = await http.delete<unknown>(ENDPOINTS.videos.remove(id));
    return normalizeVideos(payload);
  },

  async reorder(ids: string[]): Promise<ProfileVideo[]> {
    const payload = await http.put<unknown>(ENDPOINTS.videos.order, { ids });
    return normalizeVideos(payload);
  },
};
