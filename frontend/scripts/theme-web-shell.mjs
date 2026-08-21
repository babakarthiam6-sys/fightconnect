#!/usr/bin/env node
/**
 * Applique le fond sombre au document HTML de l'export web.
 *
 * Expo génère `index.html` lui-même quand `web.output` vaut « single », et
 * ignore `app/+html.tsx` dans ce mode : la page reste donc blanche derrière
 * l'application. Cela se voit à deux moments — un éclair blanc au chargement,
 * avant que le JavaScript ne peigne quoi que ce soit, et la barre d'adresse de
 * Safari qui reste claire une fois l'app ajoutée à l'écran d'accueil.
 *
 * Ce script échoue bruyamment si la structure attendue a changé : mieux vaut un
 * build qui s'arrête qu'un déploiement silencieusement blanc.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { argv, exit } from 'node:process';

const BACKGROUND = '#0C0C0E';
const MARKER = 'data-fightconnect-theme';

const HEAD_ADDITIONS = `
    <meta name="theme-color" content="${BACKGROUND}" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="FightConnect" />
    <style ${MARKER}>
      html, body, #root { background-color: ${BACKGROUND}; }
      :root { color-scheme: dark; }
    </style>
`;

const file = argv[2];
if (!file) {
  console.error('usage : node scripts/theme-web-shell.mjs <chemin/vers/index.html>');
  exit(1);
}

const html = await readFile(file, 'utf8');

if (html.includes(MARKER)) {
  console.log('Coquille web déjà thématisée, rien à faire.');
  exit(0);
}

if (!html.includes('</head>')) {
  console.error(`Structure inattendue dans ${file} : pas de </head>. Export Expo modifié ?`);
  exit(1);
}

await writeFile(file, html.replace('</head>', `${HEAD_ADDITIONS}  </head>`), 'utf8');
console.log(`Coquille web thématisée (${BACKGROUND}) : ${file}`);
