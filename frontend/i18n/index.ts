import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { enGB as dateEn, fr as dateFr } from 'date-fns/locale';

import { en } from '@/i18n/en';
import { setAcceptLanguage } from '@/services/api';
import { setLocaleAffichage } from '@/utils/formatting';
import { fr, type Cle } from '@/i18n/fr';
import { STORAGE_KEYS } from '@/constants/api';
import { storage } from '@/utils/storage';

export type Langue = 'fr' | 'en';

export const LANGUES: readonly Langue[] = ['fr', 'en'];
export const LANGUE_PAR_DEFAUT: Langue = 'fr';

const CATALOGUES: Record<Langue, Record<string, string>> = { fr, en };

/** Nom de chaque langue dans sa propre langue : c'est ainsi qu'on la reconnaît. */
export const NOMS_DE_LANGUE: Record<Langue, string> = { fr: 'Français', en: 'English' };

/**
 * Langue de l'appareil, ramenée à celles que l'application connaît.
 *
 * `Intl` est le seul mécanisme disponible partout — navigateur comme Hermes —
 * et il répond déjà « fr-CH » ou « en-GB », qu'il suffit de tronquer.
 */
export function langueDeLAppareil(): Langue {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
    const racine = (locale.split('-')[0] ?? '').toLowerCase() as Langue;
    return LANGUES.includes(racine) ? racine : LANGUE_PAR_DEFAUT;
  } catch {
    return LANGUE_PAR_DEFAUT;
  }
}

/**
 * Remplace `{nom}` par la valeur donnée.
 *
 * Volontairement minimal : pas de pluriel automatique ni de genre. Les rares
 * cas qui en ont besoin — « 1 round » contre « 2 rounds » — choisissent leur
 * clé eux-mêmes, ce qui reste lisible et n'impose aucune bibliothèque.
 */
function interpole(modele: string, params?: Record<string, string | number>): string {
  if (!params) return modele;
  return modele.replace(/\{(\w+)\}/g, (entier, cle: string) =>
    cle in params ? String(params[cle]) : entier,
  );
}

export function traduire(
  langue: Langue,
  cle: Cle,
  params?: Record<string, string | number>,
): string {
  // Une clé absente du catalogue choisi retombe sur le français plutôt que de
  // laisser un trou : mieux vaut un mot dans la mauvaise langue que rien.
  const modele = CATALOGUES[langue][cle] ?? fr[cle] ?? cle;
  return interpole(modele, params);
}

export type Traducteur = (cle: Cle, params?: Record<string, string | number>) => string;

interface Contexte {
  langue: Langue;
  t: Traducteur;
  changerLangue: (langue: Langue) => void;
  /** Étiquette de langue pour `Intl` et pour l'en-tête `Accept-Language`. */
  locale: string;
}

const I18nContext = createContext<Contexte | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [langue, setLangue] = useState<Langue>(langueDeLAppareil);

  useEffect(() => {
    // Deux couches vivent hors de React et doivent suivre : le client HTTP, qui
    // annonce la langue au serveur pour que ses erreurs reviennent traduites, et
    // le formatage des nombres et des dates, appelé aussi depuis des services.
    const locale = langue === 'fr' ? 'fr-FR' : 'en-GB';
    setAcceptLanguage(langue);
    setLocaleAffichage(locale, langue === 'fr' ? dateFr : dateEn);
  }, [langue]);

  useEffect(() => {
    // Un choix explicite l'emporte sur la langue de l'appareil, et survit au
    // redémarrage. Il est lu après le premier rendu : attendre le disque pour
    // afficher le premier écran coûterait plus qu'il ne rapporte.
    void storage
      .getString(STORAGE_KEYS.language)
      .then((valeur: string | null) => {
        if (valeur && LANGUES.includes(valeur as Langue)) setLangue(valeur as Langue);
      })
      .catch(() => undefined);
  }, []);

  const changerLangue = useCallback((suivante: Langue) => {
    setLangue(suivante);
    void storage.setString(STORAGE_KEYS.language, suivante).catch(() => undefined);
  }, []);

  const valeur = useMemo<Contexte>(
    () => ({
      langue,
      locale: langue === 'fr' ? 'fr-FR' : 'en-GB',
      changerLangue,
      t: (cle, params) => traduire(langue, cle, params),
    }),
    [changerLangue, langue],
  );

  return React.createElement(I18nContext.Provider, { value: valeur }, children);
}

export function useI18n(): Contexte {
  const contexte = useContext(I18nContext);
  if (!contexte) throw new Error('useI18n doit être utilisé à l’intérieur de <I18nProvider>.');
  return contexte;
}

/**
 * Raccourci pour les composants qui n'ont besoin que de traduire.
 *
 * Contrairement à `useI18n`, ne lève pas hors fournisseur : traduire est une
 * lecture pure du catalogue, et un composant rendu isolément — dans un test,
 * dans un écran d'erreur monté trop tôt — doit afficher du texte plutôt que de
 * faire tomber l'arbre. La langue de l'appareil sert alors de repli.
 */
export function useT(): Traducteur {
  const contexte = useContext(I18nContext);
  // Le repli parle la langue source du catalogue, et non celle de la machine :
  // hors fournisseur, le rendu doit être le même partout, y compris dans un
  // test lancé sur un poste configuré en anglais.
  const secours = useMemo<Traducteur>(
    () => (cle, params) => traduire(LANGUE_PAR_DEFAUT, cle, params),
    [],
  );
  return contexte?.t ?? secours;
}

export type { Cle };
