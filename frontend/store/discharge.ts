import { create } from 'zustand';

interface DischargeStore {
  /** Acceptation de la décharge, partagée entre l'écran d'inscription et sa modale. */
  accepted: boolean;
  setAccepted: (accepted: boolean) => void;
  reset: () => void;
}

export const useDischargeStore = create<DischargeStore>((set) => ({
  accepted: false,
  setAccepted: (accepted) => set({ accepted }),
  reset: () => set({ accepted: false }),
}));
