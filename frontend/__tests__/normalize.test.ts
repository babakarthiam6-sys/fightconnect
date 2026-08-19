import {
  extractList,
  extractTotal,
  normalizePayment,
  normalizeReview,
  normalizeSparring,
  normalizeUser,
} from '@/utils/normalize';

describe('normalisation des réponses API', () => {
  it('mappe le snake_case du backend', () => {
    const user = normalizeUser({
      _id: '64f0',
      email: 'jean@exemple.com',
      first_name: 'Jean',
      last_name: 'Dupont',
      discharge_accepted: true,
      average_rating: 4.5,
    });

    expect(user.id).toBe('64f0');
    expect(user.firstName).toBe('Jean');
    expect(user.dischargeAccepted).toBe(true);
    expect(user.averageRating).toBe(4.5);
  });

  it('lit un ObjectId Mongo sérialisé', () => {
    expect(normalizeUser({ id: { $oid: 'abc123' } }).id).toBe('abc123');
  });

  it('donne des valeurs sûres quand les champs manquent', () => {
    const sparring = normalizeSparring({});
    expect(sparring.title).toBe('Sparring');
    expect(sparring.participants).toEqual([]);
    expect(sparring.level).toBe('beginner');
    expect(sparring.maxParticipants).toBe(2);
    expect(sparring.creator).toBeNull();
  });

  it('reconvertit un prix exprimé en centimes', () => {
    expect(normalizeSparring({ price_cents: 2500 }).price).toBe(25);
    expect(normalizePayment({ amount_cents: 1990 }).amount).toBe(19.9);
  });

  it('accepte une liste de participants sous forme d’identifiants', () => {
    const sparring = normalizeSparring({ participants: ['u1', { id: 'u2', first_name: 'Ada' }] });
    expect(sparring.participants.map((participant) => participant.id)).toEqual(['u1', 'u2']);
  });

  it('replie un statut inconnu sur une valeur par défaut', () => {
    expect(normalizeSparring({ status: 'archived' }).status).toBe('open');
    expect(normalizePayment({ status: 'SUCCEEDED' }).status).toBe('succeeded');
  });

  it('remonte le signalement de modération imbriqué', () => {
    const review = normalizeReview({
      id: 'r1',
      rating: 2,
      comment: 'Contenu limite',
      moderation: { flagged: true, reason: 'harassment', score: 0.87 },
    });

    expect(review.flagged).toBe(true);
    expect(review.flagReason).toBe('harassment');
    expect(review.moderationScore).toBe(0.87);
  });

  it('extrait la liste quelle que soit l’enveloppe', () => {
    expect(extractList([1, 2])).toEqual([1, 2]);
    expect(extractList({ items: [1] })).toEqual([1]);
    expect(extractList({ results: [1, 2, 3] })).toHaveLength(3);
    expect(extractList({ inattendu: true })).toEqual([]);
  });

  it('retombe sur la taille de page si le total est absent', () => {
    expect(extractTotal({ total: 42 }, 10)).toBe(42);
    expect(extractTotal({}, 10)).toBe(10);
  });
});
