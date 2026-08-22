import {
  bookingSchema,
  loginSchema,
  passwordStrength,
  profileSchema,
  reviewSchema,
  signupSchema,
  validate,
} from '@/utils/validation';

describe('validation des identifiants', () => {
  it('normalise l’email en minuscules', () => {
    const result = validate(loginSchema, { email: '  Jean@Exemple.COM ', password: 'secret' });
    expect(result.success).toBe(true);
    expect(result.data?.email).toBe('jean@exemple.com');
  });

  it('rejette un email sans domaine', () => {
    const result = validate(loginSchema, { email: 'jean@', password: 'secret' });
    expect(result.success).toBe(false);
    expect(result.errors.email).toBeDefined();
  });

  it('exige 8 caractères, une majuscule et un chiffre', () => {
    const cases = ['court1A', 'sansmajuscule1', 'SansChiffre'];
    for (const password of cases) {
      const result = validate(signupSchema, {
        email: 'jean@exemple.com',
        password,
        firstName: 'Jean',
        lastName: 'Dupont',
        dischargeAccepted: true,
      });
      expect(result.success).toBe(false);
      expect(result.errors.password).toBeDefined();
    }
  });

  it('accepte un mot de passe conforme', () => {
    const result = validate(signupSchema, {
      email: 'jean@exemple.com',
      password: 'Sparring1',
      firstName: 'Jean',
      lastName: 'Dupont',
      dischargeAccepted: true,
    });
    expect(result.success).toBe(true);
  });

  it('bloque l’inscription sans décharge acceptée', () => {
    const result = validate(signupSchema, {
      email: 'jean@exemple.com',
      password: 'Sparring1',
      firstName: 'Jean',
      lastName: 'Dupont',
      dischargeAccepted: false,
    });
    expect(result.success).toBe(false);
    expect(result.errors.dischargeAccepted).toBeDefined();
  });

  it('gradue la force du mot de passe', () => {
    expect(passwordStrength('abc').score).toBe(0);
    expect(passwordStrength('Sparring1!2345').score).toBe(3);
  });
});

describe('validation d’une demande', () => {
  const base = {
    scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
    rounds: 2,
  };

  it('accepte un formulaire complet', () => {
    expect(validate(bookingSchema, base).success).toBe(true);
  });

  it('refuse une date passée', () => {
    const result = validate(bookingSchema, {
      ...base,
      scheduledAt: new Date(Date.now() - 86_400_000).toISOString(),
    });
    expect(result.success).toBe(false);
    expect(result.errors.scheduledAt).toBeDefined();
  });

  it('refuse un nombre de rounds vide (NaN)', () => {
    const result = validate(bookingSchema, { ...base, rounds: Number('') || Number.NaN });
    expect(result.success).toBe(false);
    expect(result.errors.rounds).toBeDefined();
  });

  it('refuse zéro round', () => {
    expect(validate(bookingSchema, { ...base, rounds: 0 }).success).toBe(false);
  });
});

describe('validation du profil sportif', () => {
  it('accepte un profil partiel : l’écran enregistre une ligne à la fois', () => {
    expect(validate(profileSchema, { city: 'Valence' }).success).toBe(true);
    expect(validate(profileSchema, {}).success).toBe(true);
  });

  it('refuse une discipline inconnue', () => {
    const result = validate(profileSchema, { style: 'sumo' });
    expect(result.success).toBe(false);
    expect(result.errors.style).toBeDefined();
  });

  it('refuse un tarif négatif', () => {
    const result = validate(profileSchema, { pricePerRound: -5 });
    expect(result.success).toBe(false);
    expect(result.errors.pricePerRound).toBeDefined();
  });

  it('borne la taille à des valeurs humaines', () => {
    expect(validate(profileSchema, { heightCm: 178 }).success).toBe(true);
    expect(validate(profileSchema, { heightCm: 30 }).success).toBe(false);
    expect(validate(profileSchema, { heightCm: 400 }).success).toBe(false);
  });

  it('n’expose qu’une erreur par champ', () => {
    const result = validate(profileSchema, { city: 'x'.repeat(200), style: 'sumo' });
    expect(Object.keys(result.errors).sort()).toEqual(['city', 'style']);
  });
});

describe('validation d’un avis', () => {
  it('impose une note entre 1 et 5', () => {
    expect(validate(reviewSchema, { rating: 0, comment: 'Séance correcte.' }).success).toBe(false);
    expect(validate(reviewSchema, { rating: 6, comment: 'Séance correcte.' }).success).toBe(false);
  });

  it('impose un commentaire d’au moins 10 caractères', () => {
    expect(validate(reviewSchema, { rating: 5, comment: 'top' }).success).toBe(false);
    expect(validate(reviewSchema, { rating: 5, comment: 'Très bonne séance.' }).success).toBe(true);
  });
});
