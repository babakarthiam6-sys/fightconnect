#!/usr/bin/env node
/**
 * Vérifie que l'export web peut réellement démarrer dans un navigateur.
 *
 * Expo charge le bundle web par une balise <script> classique, pas comme un
 * module. Un seul `import.meta` dans ce bundle est alors une erreur de syntaxe :
 * le navigateur rejette le fichier entier et l'application reste un écran noir.
 * Le build, lui, réussit sans broncher, et les tests aussi.
 *
 * C'est arrivé au passage au SDK 54 : Metro s'est mis à choisir la version ESM
 * de zustand, qui en contient. `babel.config.js` le corrige ; ce script garantit
 * que la régression ne repartira pas en production sans que personne le voie.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { argv, exit } from 'node:process';

const dir = argv[2];
if (!dir) {
  console.error('usage : node scripts/check-web-bundle.mjs <dossier de l’export web>');
  exit(1);
}

const html = await readFile(join(dir, 'index.html'), 'utf8');
const balises = [...html.matchAll(/<script\b[^>]*\bsrc="[^"]+\.js"[^>]*>/g)].map(([balise]) => balise);

if (balises.length === 0) {
  console.error(`Aucun bundle JavaScript référencé dans ${join(dir, 'index.html')}.`);
  exit(1);
}

// Dans un module, `import.meta` est valide : seul le script classique pose problème.
if (balises.every((balise) => /\btype="module"/.test(balise))) {
  console.log('Bundle web chargé comme module : import.meta y est permis.');
  exit(0);
}

// Tous les fichiers, pas seulement celui de index.html : les écrans chargés à la
// demande vivent dans des fichiers à part, chargés de la même façon.
const dossier = join(dir, '_expo/static/js/web');
const fichiers = (await readdir(dossier)).filter((nom) => nom.endsWith('.js'));

let fautes = 0;
for (const nom of fichiers) {
  const code = await readFile(join(dossier, nom), 'utf8');
  const index = code.search(/\bimport\.meta\b/);
  if (index !== -1) {
    fautes += 1;
    console.error(
      `${nom} contient « import.meta » mais est chargé comme script classique : ` +
        'le navigateur refusera de l’exécuter (écran noir).\n' +
        `  … ${code.slice(Math.max(0, index - 80), index + 40)} …\n` +
        '  Vérifiez `web.unstable_transformImportMeta` dans babel.config.js.',
    );
  }
}

if (fautes > 0) exit(1);
console.log(`Bundle web exécutable par un navigateur (${fichiers.length} fichier(s) vérifié(s)).`);
