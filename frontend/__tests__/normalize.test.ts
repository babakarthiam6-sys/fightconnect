import {
  extractList,
  extractTotal,
  normalizeBooking,
  normalizePartner,
  normalizePayment,
  normalizeReview,
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
      price_per_round: 20,
      weight_class: 'middleweight',
      height_cm: 178,
    });

    expect(user.id).toBe('64f0');
    expect(user.firstName).toBe('Jean');
    expect(user.dischargeAccepted).toBe(true);
    expect(user.averageRating).toBe(4.5);
    expect(user.pricePerRound).toBe(20);
    expect(user.weightClass).toBe('middleweight');
    expect(user.heightCm).toBe(178);
  });

  it('lit un ObjectId Mongo sérialisé', () => {
    expect(normalizeUser({ id: { $oid: 'abc123' } }).id).toBe('abc123');
  });

  it('distingue « pas encore renseigné » de « valeur par défaut »', () => {
    // C'est ce qui permet à l'écran de profil d'afficher « Non défini » plutôt
    // qu'une discipline et un tarif que personne n'a choisis.
    const vierge = normalizePartner({ id: 'p1' });

    expect(vierge.style).toBeNull();
    expect(vierge.level).toBeNull();
    expect(vierge.weightClass).toBeNull();
    expect(vierge.pricePerRound).toBeNull();
    expect(vierge.city).toBeNull();
    expect(vierge.available).toBe(false);
    expect(vierge.fightsCount).toBe(0);
  });

  it('donne des valeurs sûres quand les champs d’une demande manquent', () => {
    const booking = normalizeBooking({});

    expect(booking.rounds).toBe(1);
    expect(booking.total).toBe(0);
    expect(booking.status).toBe('pending');
    expect(booking.partner).toBeNull();
    expect(booking.paid).toBe(false);
  });

  it('recalcule le total seulement quand le serveur ne le donne pas', () => {
    // Le serveur fait foi puisque c'est lui qui facture ; le calcul local n'est
    // qu'un filet, et ne doit jamais écraser une valeur reçue.
    expect(normalizeBooking({ rounds: 3, price_per_round: 20 }).total).toBe(60);
    expect(normalizeBooking({ rounds: 3, price_per_round: 20, total: 55 }).total).toBe(55);
  });

  it('déduit la part du partenaire quand elle est absente', () => {
    const booking = normalizeBooking({ total: 40, commission: 6 });
    expect(booking.payout).toBe(34);
  });

  it('reconvertit un prix exprimé en centimes', () => {
    expect(normalizePayment({ amount_cents: 1990 }).amount).toBe(19.9);
  });

  it('replie un statut inconnu sur une valeur par défaut', () => {
    expect(normalizeBooking({ status: 'archivée' }).status).toBe('pending');
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
