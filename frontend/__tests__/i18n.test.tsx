import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { en } from '@/i18n/en';
import { fr } from '@/i18n/fr';
import { I18nProvider, langueDeLAppareil, traduire, useT, type Cle } from '@/i18n';

describe('catalogues', () => {
  /**
   * Le type de `en.ts` impose déjà la parité des clés, mais un test le dit à
   * l'exécution : c'est ce qui reste vrai si quelqu'un affaiblit le type.
   */
  it('portent exactement les mêmes clés', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
  });

  it('ne laissent aucune traduction vide', () => {
    for (const [cle, valeur] of Object.entries(en)) {
      expect(valeur.trim()).not.toBe('');
      expect(cle).not.toBe(valeur);
    }
  });

  /**
   * Une phrase à trou traduite sans son trou perdrait la valeur qu'elle devait
   * afficher — un montant, un nombre de rounds — sans que rien ne le signale.
   */
  it('gardent les mêmes paramètres entre les deux langues', () => {
    const trous = (texte: string) => (texte.match(/\{(\w+)\}/g) ?? []).sort();
    for (const cle of Object.keys(fr) as Cle[]) {
      expect(trous(en[cle])).toEqual(trous(fr[cle]));
    }
  });
});

describe('traduire', () => {
  it('rend la langue demandée', () => {
    expect(traduire('fr', 'partenaire.reserver')).toBe('Réserver');
    expect(traduire('en', 'partenaire.reserver')).toBe('Book');
  });

  it('remplace les paramètres', () => {
    expect(traduire('fr', 'partenaire.avis', { n: 3 })).toBe('(3 avis)');
    expect(traduire('en', 'partenaire.avis', { n: 3 })).toBe('(3 reviews)');
  });

  it('laisse intact un paramètre qu’on ne lui donne pas', () => {
    expect(traduire('fr', 'partenaire.avis')).toBe('({n} avis)');
  });
});

describe('langue de l’appareil', () => {
  it('ne renvoie qu’une langue connue', () => {
    expect(['fr', 'en']).toContain(langueDeLAppareil());
  });
});

function Sonde() {
  const t = useT();
  return <Text>{t('partenaire.reserver')}</Text>;
}

describe('useT', () => {
  it('traduit sous le fournisseur', () => {
    render(
      <I18nProvider>
        <Sonde />
      </I18nProvider>,
    );
    expect(screen.getByText(/Réserver|Book/)).toBeTruthy();
  });

  /**
   * Hors fournisseur, un composant doit afficher du texte plutôt que faire
   * tomber l'arbre — et toujours le même, quelle que soit la machine.
   */
  it('retombe sur la langue source sans fournisseur', () => {
    render(<Sonde />);
    expect(screen.getByText('Réserver')).toBeTruthy();
  });
});
