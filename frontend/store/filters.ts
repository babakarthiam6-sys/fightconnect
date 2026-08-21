import { create } from 'zustand';

import type { PartnerFilters } from '@/types';

const EMPTY_FILTERS: PartnerFilters = {
  city: '',
  level: null,
  style: null,
  weightClass: null,
};

interface FilterStore extends PartnerFilters {
  setCity: (city: string) => void;
  setLevel: (level: PartnerFilters['level']) => void;
  setStyle: (style: PartnerFilters['style']) => void;
  setWeightClass: (weightClass: PartnerFilters['weightClass']) => void;
  reset: () => void;
  /** Nombre de filtres actifs, affiché sur le bouton « Filtres ». */
  activeCount: () => number;
}

/**
 * Filtres de la recherche de partenaires.
 *
 * Hors des contextes React pour qu'un changement de filtre ne provoque pas le
 * rendu de tout l'arbre applicatif.
 */
export const useFilterStore = create<FilterStore>((set, get) => ({
  ...EMPTY_FILTERS,
  setCity: (city) => set({ city }),
  setLevel: (level) => set({ level }),
  setStyle: (style) => set({ style }),
  setWeightClass: (weightClass) => set({ weightClass }),
  reset: () => set({ ...EMPTY_FILTERS }),
  activeCount: () => {
    const { level, style, weightClass } = get();
    return [level, style, weightClass].filter((value) => value !== null).length;
  },
}));
