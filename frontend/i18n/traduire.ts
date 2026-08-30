import { en } from '@/i18n/en';
import { fr, type Cle } from '@/i18n/fr';

/**
 * Cœur de traduction, sans React et sans dépendance à la couche réseau.
 *
 * Extrait de `i18n/index.ts` pour une raison précise : le client HTTP et le
 * formatage des dates doivent traduire, mais `i18n/index.ts` les importe déjà
 * pour leur pousser la langue. Les faire s'importer l'un l'autre créerait un
 * cycle. Ce fichier-ci ne dépend de rien, donc tout le monde peut s'en servir.
 */

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

/**
 * Langue des couches qui vivent hors de React.
 *
 * Le client HTTP normalise les erreurs dans un intercepteur, et le formatage
 * des dates sert aussi depuis des services : ni l'un ni l'autre ne peut appeler
 * de hook. Le fournisseur pose la langue ici une fois, et ils la lisent.
 */
let langueCourante: Langue = LANGUE_PAR_DEFAUT;

export function definirLangueGlobale(langue: Langue): void {
  langueCourante = LANGUES.includes(langue) ? langue : LANGUE_PAR_DEFAUT;
}

/** Traduit dans la langue courante, hors de tout composant. */
export function tGlobal(cle: Cle, params?: Record<string, string | number>): string {
  return traduire(langueCourante, cle, params);
}

export type { Cle };
