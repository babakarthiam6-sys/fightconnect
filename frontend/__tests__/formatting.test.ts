import {
  formatDuration,
  formatLevel,
  formatPrice,
  formatRating,
  formatStyle,
  formatUserName,
  getInitials,
  truncate,
} from '@/utils/formatting';

describe('formatage', () => {
  it('affiche un prix en euros', () => {
    // L'espace insécable utilisé par Intl varie selon l'ICU : on teste le contenu.
    expect(formatPrice(25)).toMatch(/25/);
    expect(formatPrice(25)).toMatch(/€/);
  });

  it('remplace un montant invalide par zéro', () => {
    expect(formatPrice(null)).toMatch(/0/);
    expect(formatPrice(undefined)).toMatch(/0/);
  });

  it('convertit les minutes en heures lisibles', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(90)).toBe('1 h 30');
    expect(formatDuration(0)).toBe('—');
    expect(formatDuration(null)).toBe('—');
  });

  it('traduit niveaux et disciplines, et retombe sur la valeur brute', () => {
    expect(formatLevel('amateur')).toBe('Amateur');
    expect(formatStyle('muay_thai')).toBe('Muay-thaï');
    expect(formatStyle('sumo')).toBe('sumo');
    expect(formatLevel(null)).toBe('—');
  });

  it('abrège le nom de famille', () => {
    expect(formatUserName({ firstName: 'Jean', lastName: 'Dupont' })).toBe('Jean D.');
    expect(formatUserName({ firstName: 'Jean', lastName: '' })).toBe('Jean');
    expect(formatUserName(null)).toBe('Utilisateur');
  });

  it('construit des initiales', () => {
    expect(getInitials({ firstName: 'Jean', lastName: 'Dupont' })).toBe('JD');
    expect(getInitials(null)).toBe('?');
  });

  it('formate une note ou signale son absence', () => {
    expect(formatRating(4.65)).toBe('4,7');
    expect(formatRating(0)).toBe('—');
    expect(formatRating(null)).toBe('—');
  });

  it('tronque au-delà de la limite seulement', () => {
    expect(truncate('court', 10)).toBe('court');
    expect(truncate('phrase beaucoup trop longue', 10)).toHaveLength(10);
  });
});

describe('formatPrice, seule fonction d’affichage des prix', () => {
  /** Les espaces insécables de `Intl` rendent les comparaisons brutes illisibles. */
  const lisible = (texte: string) => texte.replace(/[\u00a0\u202f\u2009]/g, ' ');

  it('écrit un montant rond sans centimes', () => {
    expect(lisible(formatPrice(40))).toBe('40 €');
  });

  it('force les centimes à la demande', () => {
    expect(lisible(formatPrice(6, 'EUR', { cents: true }))).toBe('6,00 €');
    expect(lisible(formatPrice(34, 'EUR', { cents: true }))).toBe('34,00 €');
  });

  it('signe un montant retenu', () => {
    expect(lisible(formatPrice(9, 'EUR', { cents: true, negative: true }))).toBe('−9,00 €');
  });

  it('ne signe pas un zéro : « −0,00 € » n’a pas de sens', () => {
    expect(lisible(formatPrice(0, 'EUR', { cents: true, negative: true }))).toBe('0,00 €');
  });

  it('n’écrit jamais un prix avec un point décimal', () => {
    for (const montant of [0, 6, 9.5, 34.25, 40, 1250.5]) {
      for (const options of [{}, { cents: true }, { cents: true, negative: true }]) {
        expect(formatPrice(montant, 'EUR', options)).not.toContain('.');
      }
    }
  });
});
