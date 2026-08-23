import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { LEVEL_IDS, STYLE_IDS, WEIGHT_IDS } from '@/constants/sports';
import { CODES_DEVISE, CODES_PAYS } from '@/i18n/pays';
import { fr } from '@/i18n/fr';

/**
 * Les listes d'identifiants existent des deux côtés — Python et TypeScript —
 * parce que l'étape Docker ne copie que `backend/` dans l'image finale : un
 * fichier commun placé à la racine n'y serait pas, et l'API tomberait au
 * démarrage. Deux listes vérifiées valent mieux qu'une source unique qui casse
 * le déploiement.
 *
 * Sans ce test, l'oubli est silencieux et coûteux : le serveur accepterait une
 * discipline que le mobile ne sait pas nommer, ou refuserait un pays que
 * l'écran propose.
 */
function tupleDuServeur(fichier: string, nom: string): string[] | null {
  const chemin = join(__dirname, '..', '..', 'backend', 'app', fichier);
  if (!existsSync(chemin)) return null;

  const source = readFileSync(chemin, 'utf8');
  const bloc = new RegExp(`${nom}[^=]*=\\s*\\(([^)]*)\\)`, 's').exec(source);
  const brut = bloc?.[1] ?? new RegExp(`${nom}[^=]*=\\s*\\[([^\\]]*)\\]`, 's').exec(source)?.[1];
  if (!brut) return null;

  return [...brut.matchAll(/["']([\w-]+)["']/g)].map((m) => m[1] as string);
}

function motsDuServeur(fichier: string, nom: string): string[] | null {
  const chemin = join(__dirname, '..', '..', 'backend', 'app', fichier);
  if (!existsSync(chemin)) return null;

  const source = readFileSync(chemin, 'utf8');
  const bloc = new RegExp(`${nom}[^=]*=\\s*frozenset\\(\\s*"""(.*?)"""`, 's').exec(source);
  if (!bloc?.[1]) return null;
  return bloc[1].trim().split(/\s+/);
}

describe('les deux côtés parlent des mêmes sports', () => {
  it('mêmes disciplines que le serveur', () => {
    const serveur = tupleDuServeur('schemas.py', 'STYLES');
    if (!serveur) return; // Serveur absent : rien à comparer.
    expect([...STYLE_IDS].sort()).toEqual([...serveur].sort());
  });

  it('mêmes niveaux que le serveur', () => {
    const serveur = tupleDuServeur('schemas.py', 'LEVELS');
    if (!serveur) return;
    expect([...LEVEL_IDS].sort()).toEqual([...serveur].sort());
  });

  it('mêmes catégories de poids que le serveur', () => {
    const serveur = tupleDuServeur('schemas.py', 'WEIGHT_CLASSES');
    if (!serveur) return;
    expect([...WEIGHT_IDS].sort()).toEqual([...serveur].sort());
  });

  it('mêmes devises que le serveur', () => {
    const serveur = tupleDuServeur('geo.py', 'CURRENCIES');
    if (!serveur) return;
    expect([...CODES_DEVISE].sort()).toEqual([...serveur].sort());
  });

  it('mêmes pays que le serveur', () => {
    const serveur = motsDuServeur('geo.py', 'COUNTRIES');
    if (!serveur) return;
    expect([...CODES_PAYS].sort()).toEqual([...serveur].sort());
  });
});

describe('chaque identifiant a un libellé', () => {
  it('couvre disciplines, niveaux et poids', () => {
    for (const id of STYLE_IDS) expect(Object.hasOwn(fr, `sport.${id}`)).toBe(true);
    for (const id of LEVEL_IDS) expect(Object.hasOwn(fr, `niveau.${id}`)).toBe(true);
    for (const id of WEIGHT_IDS) expect(Object.hasOwn(fr, `poids.${id}`)).toBe(true);
  });
});
