import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Le garde-fou qui manquait.
 *
 * Le type de `en.ts` garantit qu'aucune clé n'est traduite à moitié. Il ne dit
 * rien d'une phrase écrite directement dans un écran : celle-là n'a pas de clé,
 * donc rien à oublier de traduire — elle reste simplement en français pour
 * toujours, et personne ne s'en aperçoit avant qu'un anglophone n'ouvre l'app.
 *
 * C'est exactement ce qui s'est produit : après avoir converti trente-cinq
 * fichiers, un passage en navigateur a montré un écran d'inscription moitié
 * français moitié anglais. Dix-sept phrases avaient échappé au premier balayage
 * parce qu'elles n'étaient pas des chaînes entre guillemets mais du texte nu
 * entre deux balises JSX.
 */

const RACINE = join(__dirname, '..');
// `utils` et `services` ont été ajoutés après coup : c'est là que se cachait
// un « Utilisateur » en dur, affiché à la place du nom d'un compte supprimé.
const DOSSIERS = ['app', 'components', 'utils', 'services', 'context', 'store', 'hooks'];

/** Mots qui ne peuvent venir que d'une phrase française destinée à l'écran. */
const FRANCAIS =
  /[àâäéèêëîïôöùûüçÀÉÈÊÎÔÛ]|\b(le|la|les|une|des|mon|ma|mes|vous|nous|pour|avec|dans|sur|est|sont|par|votre|vos|avis|ans?|profil|séances?|demandes?)\b/i;

/**
 * Une phrase sans accent ni mot-outil échappait au filtre ci-dessus :
 * « Ressource introuvable. » est passée ainsi. Deux mots et un point final
 * suffisent à en faire une phrase destinée à quelqu'un.
 */
const PHRASE = /^[A-ZÀÉÈ][^.!?]{4,}[.!?]$/;

function fichiers(dossier: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) trouves.push(...fichiers(chemin));
    else if (/\.tsx?$/.test(entree)) trouves.push(chemin);
  }
  return trouves;
}

/** Retire ce qui n'atteint jamais l'écran : commentaires, imports, styles. */
function partieVisible(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*(\/\/|\*|\/\*).*$/gm, '')
    .replace(/^import .*$/gm, '')
    .replace(/const styles = StyleSheet\.create\(\{[\s\S]*/, '');
}

function phrasesEnDur(chemin: string): string[] {
  const visible = horsInterface(partieVisible(readFileSync(chemin, 'utf8')));
  const candidats: string[] = [];

  // Texte nu entre deux balises : <Text>Bonjour</Text>
  for (const [, texte] of visible.matchAll(/>\s*([^<>{}\n][^<>{}]{3,})\s*</g)) {
    candidats.push((texte as string).trim());
  }
  // Chaînes littérales : label="Bonjour", placeholder='Bonjour'
  for (const [, , texte] of visible.matchAll(/(['"])((?:[^'"\\\n]){5,120}?)\1/g)) {
    candidats.push(texte as string);
  }

  return candidats.filter(
    (texte) =>
      (FRANCAIS.test(texte) || PHRASE.test(texte.trim())) &&
      texte.length >= 5 &&
      !texte.startsWith('t(') &&
      // Les fragments de code attrapés par erreur portent presque toujours un
      // point-virgule ou une flèche ; une phrase d'interface, jamais.
      !/[;=]|=>/.test(texte) &&
      // Une clé de traduction n'est pas une phrase : « discussion.avec »
      // contient « avec » mais ne s'affiche jamais telle quelle.
      !/^[a-z][\w]*\.[\w.]+$/.test(texte),
  );
}

/**
 * Les messages de `throw new Error` ne sont pas de l'interface : ils signalent
 * une faute de programmation — un hook appelé hors de son fournisseur — et ne
 * remontent jamais à l'écran. Les traduire alourdirait le catalogue de phrases
 * que personne ne lira jamais.
 */
function horsInterface(source: string): string {
  return source.replace(/throw new Error\([\s\S]*?\);/g, '');
}

describe('aucune phrase française écrite en dur', () => {
  const tous = DOSSIERS.flatMap((d) => fichiers(join(RACINE, d)));

  it('trouve bien des fichiers à inspecter', () => {
    expect(tous.length).toBeGreaterThan(20);
  });

  it.each(tous)('%s', (chemin) => {
    const restes = phrasesEnDur(chemin);
    expect(restes).toEqual([]);
  });
});
