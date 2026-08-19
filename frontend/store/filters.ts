import { create } from 'zustand';

import type { SparringFilters } from '@/types';

const EMPTY_FILTERS: SparringFilters = {
  search: '',
  level: null,
  style: null,
  minPrice: null,
  maxPrice: null,
};

interface FilterStore extends SparringFilters {
  setSearch: (search: string) => void;
  setLevel: (level: SparringFilters['level']) => void;
  setStyle: (style: SparringFilters['style']) => void;
  setPriceRange: (min: number | null, max: number | null) => void;
  reset: () => void;
  /** Nombre de filtres actifs, affiché sur le bouton « Filtres ». */
  activeCount: () => number;
}

/**
 * Filtres de la liste des sparrings.
 *
 * Hors des contextes React pour qu'un changement de filtre ne provoque pas le
 * rendu de tout l'arbre applicatif.
 */
export const useFilterStore = create<FilterStore>((set, get) => ({
  ...EMPTY_FILTERS,
  setSearch: (search) => set({ search }),
  setLevel: (level) => set({ level }),
  setStyle: (style) => set({ style }),
  setPriceRange: (minPrice, maxPrice) => set({ minPrice, maxPrice }),
  reset: () => set({ ...EMPTY_FILTERS }),
  activeCount: () => {
    const { level, style, minPrice, maxPrice } = get();
    return [level, style, minPrice, maxPrice].filter((value) => value !== null).length;
  },
}));
