import {
  loginSchema,
  passwordStrength,
  reviewSchema,
  signupSchema,
  sparringSchema,
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

describe('validation d’un sparring', () => {
  const base = {
    title: 'Sparring boxe technique',
    description: 'Séance technique à intensité modérée, gants 14 oz obligatoires.',
    location: 'Paris 11e',
    scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
    durationMinutes: 60,
    level: 'intermediate',
    style: 'boxing',
    price: 25,
    maxParticipants: 4,
  };

  it('accepte un formulaire complet', () => {
    expect(validate(sparringSchema, base).success).toBe(true);
  });

  it('refuse une date passée', () => {
    const result = validate(sparringSchema, {
      ...base,
      scheduledAt: new Date(Date.now() - 86_400_000).toISOString(),
    });
    expect(result.success).toBe(false);
    expect(result.errors.scheduledAt).toBeDefined();
  });

  it('refuse un champ numérique vide (NaN)', () => {
    const result = validate(sparringSchema, { ...base, price: Number('') || Number.NaN });
    expect(result.success).toBe(false);
    expect(result.errors.price).toBeDefined();
  });

  it('refuse une discipline inconnue', () => {
    const result = validate(sparringSchema, { ...base, style: 'sumo' });
    expect(result.success).toBe(false);
    expect(result.errors.style).toBeDefined();
  });

  it('n’expose qu’une erreur par champ', () => {
    const result = validate(sparringSchema, { ...base, title: 'a' });
    expect(Object.keys(result.errors)).toEqual(['title']);
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
