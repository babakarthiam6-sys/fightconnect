import type { Cle } from '@/i18n';
import type { User } from '@/types';

/**
 * Ce qui manque à un profil pour apparaître dans la recherche.
 *
 * Le serveur refuse de rendre quelqu'un disponible sans discipline ni tarif
 * (`backend/app/routers/auth.py`), et la recherche écarte en plus les profils
 * dont la discipline ou le tarif sont nuls. Jusqu'ici l'application ne le
 * disait qu'au moment du refus : on cochait « Disponible », on recevait une
 * erreur, et on devinait le reste.
 *
 * Cette fonction dit la même règle *à l'avance*, et distingue deux niveaux :
 * ce sans quoi on n'existe pas, et ce sans quoi on n'est pas trouvé.
 */

/** Sans ces champs, le serveur refuse la mise en ligne. */
const OBLIGATOIRES = ['sport', 'tarif'] as const;

/** Avec ceux-là, on remonte dans les recherches filtrées des autres. */
const RECOMMANDES = ['ville', 'pays', 'niveau', 'poids'] as const;

export type ChampManquant = (typeof OBLIGATOIRES)[number] | (typeof RECOMMANDES)[number];

/** Clé de traduction du libellé de chaque champ, telle qu'affichée au profil. */
const LIBELLES: Record<ChampManquant, Cle> = {
  sport: 'profil.sport',
  tarif: 'profil.tarif',
  ville: 'profil.ville',
  pays: 'profil.pays',
  niveau: 'profil.niveau',
  poids: 'profil.poids',
};

export interface Visibilite {
  /** Le serveur accepterait de mettre ce profil en ligne. */
  publiable: boolean;
  /** Publiable **et** l'interrupteur est sur « disponible ». */
  visible: boolean;
  /** Champs sans lesquels rien n'est possible, dans l'ordre où les remplir. */
  obligatoiresManquants: ChampManquant[];
  /** Champs qui améliorent la découvrabilité, une fois le reste rempli. */
  recommandesManquants: ChampManquant[];
  /** De 0 à 1, sur les six champs. Sert à la barre de progression. */
  progression: number;
}

function estVide(valeur: unknown): boolean {
  if (valeur === null || valeur === undefined) return true;
  if (typeof valeur === 'string') return valeur.trim() === '';
  return false;
}

export function evaluerVisibilite(user: User | null): Visibilite {
  const vide: Visibilite = {
    publiable: false,
    visible: false,
    obligatoiresManquants: [...OBLIGATOIRES],
    recommandesManquants: [...RECOMMANDES],
    progression: 0,
  };
  if (!user) return vide;

  const valeurs: Record<ChampManquant, unknown> = {
    sport: user.style,
    // Un tarif à zéro est un choix — sparring gratuit — pas un champ vide.
    tarif: user.pricePerRound,
    ville: user.city,
    pays: user.country,
    niveau: user.level,
    poids: user.weightClass,
  };

  const obligatoiresManquants = OBLIGATOIRES.filter((champ) => estVide(valeurs[champ]));
  const recommandesManquants = RECOMMANDES.filter((champ) => estVide(valeurs[champ]));
  const remplis = OBLIGATOIRES.length + RECOMMANDES.length
    - obligatoiresManquants.length - recommandesManquants.length;

  const publiable = obligatoiresManquants.length === 0;

  return {
    publiable,
    visible: publiable && user.available,
    obligatoiresManquants,
    recommandesManquants,
    progression: remplis / (OBLIGATOIRES.length + RECOMMANDES.length),
  };
}

export function libelleDuChamp(champ: ChampManquant): Cle {
  return LIBELLES[champ];
}
