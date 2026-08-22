/**
 * Test de contrat : le mobile sait-il lire ce que l'API envoie vraiment ?
 *
 * Les autres tests utilisent des payloads écrits à la main, qui décrivent ce que
 * *je crois* que l'API renvoie. Ceux-ci utilisent des réponses réellement
 * capturées sur l'API FastAPI de `backend/`
 * (`backend/scripts/capture_fixtures.py` les régénère). Un champ renommé côté
 * serveur casse ici, au lieu de casser silencieusement dans l'application.
 *
 * Chaque assertion vérifie une valeur *venue de la réponse*, jamais une valeur
 * par défaut : les normaliseurs étant tolérants, un test qui se contenterait de
 * « le champ existe » passerait même si le mapping était entièrement faux.
 */
import { AxiosError, AxiosHeaders } from 'axios';

import { toAppError } from '@/services/api';
import {
  extractList,
  extractTotal,
  normalizeBooking,
  normalizePartner,
  normalizePayment,
  normalizeReview,
  normalizeRevenueStats,
  normalizeUser,
  normalizeUserRisk,
} from '@/utils/normalize';
import responses from './fixtures/api-responses.json';

describe('contrat API — comptes', () => {
  it('lit le profil renvoyé à l’inscription', () => {
    const user = normalizeUser(responses.auth_signup.user);

    expect(user.id).toHaveLength(24); // ObjectId Mongo sérialisé
    expect(user.email).toBe('luis@exemple.com');
    expect(user.firstName).toBe('Luis');
    expect(user.lastName).toBe('Dupont');
    expect(user.dischargeAccepted).toBe(true);
    expect(user.createdAt).not.toBeNull();
  });

  it('trouve le jeton là où l’API le place', () => {
    // Le service d'authentification cherche access_token / accessToken / token.
    expect(responses.auth_login).toHaveProperty('access_token');
    expect(typeof responses.auth_login.access_token).toBe('string');
    expect(responses.auth_login.token_type).toBe('bearer');
  });

  it('lit le profil sportif renvoyé après modification', () => {
    const user = normalizeUser(responses.auth_profile_update);

    expect(user.city).toBe('Valence');
    expect(user.style).toBe('boxing');
    expect(user.level).toBe('amateur');
    expect(user.weightClass).toBe('middleweight');
    expect(user.heightCm).toBe(178);
    expect(user.fightsCount).toBe(15);
    expect(user.experienceYears).toBe(5);
    expect(user.pricePerRound).toBe(20);
    expect(user.available).toBe(true);
  });

  it('lit le profil de /auth/me', () => {
    const user = normalizeUser(responses.auth_me);
    expect(user.email).toBe('luis@exemple.com');
    expect(user.pricePerRound).toBe(20);
  });
});

describe('contrat API — partenaires', () => {
  it('lit une fiche publique sans rien perdre', () => {
    const partner = normalizePartner(responses.partner_detail);

    expect(partner.firstName).toBe('Luis');
    expect(partner.city).toBe('Valence');
    expect(partner.style).toBe('boxing');
    expect(partner.weightClass).toBe('middleweight');
    expect(partner.pricePerRound).toBe(20);
    expect(partner.fightsCount).toBe(15);
    expect(partner.bio).toContain('Boxeur amateur');
  });

  it('ne divulgue pas l’email dans une fiche publique', () => {
    // Le sérialiseur serveur construit la fiche champ par champ : ce test
    // échoue si quelqu'un le remplace un jour par une soustraction.
    expect(responses.partner_detail).not.toHaveProperty('email');
  });

  it('lit une liste paginée de partenaires', () => {
    const items = extractList(responses.partners_list);

    expect(items.length).toBeGreaterThan(0);
    expect(extractTotal(responses.partners_list, 0)).toBe(responses.partners_list.total);
    expect(normalizePartner(items[0]).firstName).toBe('Luis');
  });
});

describe('contrat API — demandes', () => {
  it('lit une demande créée, décompte compris', () => {
    const booking = normalizeBooking(responses.booking_create);

    expect(booking.rounds).toBe(2);
    expect(booking.pricePerRound).toBe(20);
    expect(booking.total).toBe(40);
    expect(booking.status).toBe('pending');
    expect(booking.paid).toBe(false);
    expect(booking.partner?.firstName).toBe('Luis');
    expect(booking.requester?.firstName).toBe('Ana');
  });

  it('vérifie que la commission ne s’ajoute pas au total', () => {
    const booking = normalizeBooking(responses.booking_create);

    // Ce que paie le demandeur, c'est `total`. La commission sort de la part
    // du partenaire : les deux doivent se recomposer exactement.
    expect(booking.commission + booking.payout).toBeCloseTo(booking.total, 2);
    expect(booking.total).toBe(booking.rounds * booking.pricePerRound);
  });

  it('lit les transitions de statut', () => {
    expect(normalizeBooking(responses.booking_accept).status).toBe('accepted');
    expect(normalizeBooking(responses.booking_complete).status).toBe('completed');
  });

  it('distingue les demandes reçues des demandes envoyées', () => {
    const sent = extractList(responses.bookings_sent).map(normalizeBooking);
    const received = extractList(responses.bookings_received).map(normalizeBooking);

    expect(sent[0]?.requester?.firstName).toBe('Ana');
    expect(received[0]?.partner?.firstName).toBe('Luis');
  });
});

describe('contrat API — avis et modération', () => {
  it('lit un avis publié', () => {
    const review = normalizeReview(responses.moderation_review);

    expect(review.rating).toBe(5);
    expect(review.comment).toBe('Excellente séance, très pédagogue.');
    expect(review.flagged).toBe(false);
    expect(review.author?.firstName).toBe('Ana');
    expect(review.bookingId).toHaveLength(24);
  });

  it('lit un avis signalé par la modération', () => {
    const review = normalizeReview(responses.moderation_review_flagged);

    expect(review.flagged).toBe(true);
    expect(review.flagReason).not.toBeNull();
  });

  it('lit un profil de risque', () => {
    const risk = normalizeUserRisk(responses.moderation_user_risk);

    expect(['low', 'medium', 'high']).toContain(risk.riskLevel);
    expect(risk.userId).toHaveLength(24);
  });

  it('lit des recommandations de partenaires', () => {
    const items = extractList(responses.moderation_recommendations).map(normalizePartner);
    expect(items.every((item) => item.id.length === 24)).toBe(true);
  });
});

describe('contrat API — argent', () => {
  it('lit un historique de paiements', () => {
    const items = extractList(responses.payments_history).map(normalizePayment);

    expect(items).toHaveLength(1);
    const payment = items[0]!;
    expect(payment.amount).toBe(40);
    expect(payment.currency).toBe('EUR');
    expect(payment.status).toBe('succeeded');
    expect(payment.partnerName).toBe('Luis Dupont');
    expect(payment.bookingId).toHaveLength(24);
  });

  it('lit les statistiques de revenus', () => {
    const stats = normalizeRevenueStats(responses.revenue_stats);

    expect(stats.currency).toBe('EUR');
    expect(stats.totalBookings).toBe(responses.revenue_stats.total_bookings);
    expect(stats.completedBookings).toBe(responses.revenue_stats.completed_bookings);
    expect(stats.averageRating).toBe(responses.revenue_stats.average_rating);
  });

  it('lit l’état des versements', () => {
    expect(responses.payouts_status).toHaveProperty('payouts_enabled');
    expect(responses.payouts_status).toHaveProperty('stripe_configured');
  });
});

describe('contrat API — erreurs', () => {
  it('extrait le message d’une 401', () => {
    const error = toAppError(
      new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, null, {
        status: responses.error_401.status,
        statusText: 'Unauthorized',
        data: responses.error_401.body,
        headers: new AxiosHeaders(),
        config: { headers: new AxiosHeaders() },
      }),
    );

    expect(error.status).toBe(401);
    expect(error.message).toBe(responses.error_401.body.detail);
  });

  it('extrait les erreurs de champ d’une 422 FastAPI', () => {
    const error = toAppError(
      new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, null, {
        status: responses.error_422.status,
        statusText: 'Unprocessable Entity',
        data: responses.error_422.body,
        headers: new AxiosHeaders(),
        config: { headers: new AxiosHeaders() },
      }),
    );

    expect(error.status).toBe(422);
    // FastAPI renvoie une liste d'erreurs : chacune doit se retrouver indexée
    // par nom de champ, sinon aucun formulaire ne saurait où l'afficher.
    expect(error.fieldErrors).not.toBeNull();
    expect(Object.keys(error.fieldErrors ?? {}).length).toBeGreaterThan(0);
  });
});
