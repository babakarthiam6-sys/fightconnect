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
