/**
 * Identifiants des disciplines, niveaux et catégories de poids.
 *
 * Séparés des libellés : ceux-ci vivent dans le catalogue de traduction, sous
 * les préfixes `sport.`, `niveau.` et `poids.`. Avant, les écrans dérivaient la
 * liste des identifiants de la table française des libellés — la liste et sa
 * traduction ne pouvaient donc pas diverger, mais rien ne les reliait au
 * serveur. `__tests__/sports.test.ts` compare désormais ces tuples à ceux de
 * `backend/app/schemas.py` et échoue si un côté bouge sans l'autre.
 */
import type { SparringLevel, SparringStyle, WeightClass } from '@/types';

export const STYLE_IDS: readonly SparringStyle[] = [
  'boxing',
  'muay_thai',
  'kickboxing',
  'mma',
  'bjj',
  'wrestling',
  'karate',
  'judo',
];

export const LEVEL_IDS: readonly SparringLevel[] = ['beginner', 'amateur', 'pro'];

export const WEIGHT_IDS: readonly WeightClass[] = [
  'flyweight',
  'bantamweight',
  'featherweight',
  'lightweight',
  'welterweight',
  'middleweight',
  'light_heavyweight',
  'heavyweight',
];
