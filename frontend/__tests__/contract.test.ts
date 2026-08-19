/**
 * Test de contrat : le mobile sait-il lire ce que l'API envoie vraiment ?
 *
 * Les autres tests utilisent des payloads écrits à la main, qui décrivent ce que
 * *je crois* que l'API renvoie. Ceux-ci utilisent des réponses réellement
 * capturées sur l'API FastAPI de `backend/`, tournant contre un vrai MongoDB
 * (voir `fixtures/api-responses.json`). Un champ renommé côté serveur casse ici,
 * au lieu de casser silencieusement dans l'application.
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
  normalizePayment,
  normalizeReview,
  normalizeRevenueStats,
  normalizeSparring,
  normalizeUser,
  normalizeUserRisk,
} from '@/utils/normalize';
import responses from './fixtures/api-responses.json';

describe('contrat API — comptes', () => {
  it('lit le profil renvoyé à l’inscription', () => {
    const user = normalizeUser(responses.auth_signup.user);

    expect(user.id).toHaveLength(24); // ObjectId Mongo sérialisé
    expect(user.email).toBe('ada@exemple.com');
    expect(user.firstName).toBe('Ada');
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

  it('lit le profil de /auth/me', () => {
    const user = normalizeUser(responses.auth_me);
    expect(user.email).toBe('ada@exemple.com');
  });
});

describe('contrat API — sparrings', () => {
  it('lit une séance créée sans rien perdre', () => {
    const sparring = normalizeSparring(responses.sparring_create);

    expect(sparring.title).toBe('Sparring boxe technique');
    expect(sparring.location).toBe('Paris 11e');
    expect(sparring.price).toBe(25.5);
    expect(sparring.currency).toBe('EUR');
    expect(sparring.durationMinutes).toBe(90);
    expect(sparring.level).toBe('intermediate');
    expect(sparring.style).toBe('muay_thai');
    expect(sparring.maxParticipants).toBe(4);
    expect(sparring.status).toBe('open');
    // Une date vide ferait afficher « Date à confirmer » sur toutes les cartes.
    expect(Number.isFinite(Date.parse(sparring.scheduledAt))).toBe(true);
  });

  it('reconstitue l’organisateur et les participants', () => {
    const sparring = normalizeSparring(responses.sparring_detail);

    expect(sparring.creator).not.toBeNull();
    expect(sparring.creator?.firstName).toBe('Ada');
    expect(sparring.participants).toHaveLength(1);
    expect(sparring.participants[0]?.firstName).toBe('Léa');
    // Un identifiant vide casserait la détection « est-ce que je participe ? ».
    expect(sparring.participants[0]?.id).toHaveLength(24);
  });

  it('lit l’enveloppe de la liste paginée', () => {
    const items = extractList(responses.sparrings_list);

    expect(items.length).toBeGreaterThan(0);
    expect(extractTotal(responses.sparrings_list, 0)).toBe(items.length);
    expect(items.map((item) => normalizeSparring(item).title)).toContain(
      'Sparring boxe technique',
    );
  });

  it('lit la séance renvoyée après inscription', () => {
    const sparring = normalizeSparring(responses.sparring_join);
    expect(sparring.participants.map((person) => person.firstName)).toEqual(['Léa']);
  });

  it('lit les recommandations', () => {
    const items = extractList(responses.moderation_recommendations).map(normalizeSparring);
    expect(items.every((item) => item.id.length === 24)).toBe(true);
  });
});

describe('contrat API — avis et modération', () => {
  it('lit un avis publié', () => {
    const review = normalizeReview(responses.moderation_review);

    expect(review.rating).toBe(5);
    expect(review.comment).toBe('Excellente séance, très pédagogue.');
    expect(review.flagged).toBe(false);
    expect(review.author?.firstName).toBe('Léa');
    expect(review.sparringId).toHaveLength(24);
  });

  it('voit le signalement de la modération', () => {
    const review = normalizeReview(responses.moderation_review_flagged);

    // Sans cela, le badge « signalé par la modération » ne s'afficherait jamais.
    expect(review.flagged).toBe(true);
    expect(review.flagReason).toBe('harassment');
  });

  it('lit la liste des avis d’une séance', () => {
    const reviews = extractList(responses.sparring_reviews).map(normalizeReview);
    expect(reviews).toHaveLength(2);
    expect(reviews.filter((review) => review.flagged)).toHaveLength(1);
  });

  it('lit le profil de risque', () => {
    const risk = normalizeUserRisk(responses.moderation_user_risk);

    expect(['low', 'medium', 'high']).toContain(risk.riskLevel);
    expect(risk.userId).toHaveLength(24);
    expect(risk.reasons.length).toBeGreaterThan(0);
  });
});

describe('contrat API — argent', () => {
  it('lit un paiement de l’historique', () => {
    const payments = extractList(responses.payments_history).map(normalizePayment);

    expect(payments).toHaveLength(1);
    expect(payments[0]?.amount).toBe(25.5);
    expect(payments[0]?.status).toBe('succeeded');
    expect(payments[0]?.currency).toBe('EUR');
    expect(payments[0]?.sparringTitle).toBe('Sparring boxe technique');
  });

  it('lit les statistiques de revenus', () => {
    const stats = normalizeRevenueStats(responses.revenue_stats);

    expect(stats.totalSparrings).toBe(2);
    expect(stats.averageRating).toBe(5);
    expect(stats.currency).toBe('EUR');
  });
});

describe('contrat API — erreurs', () => {
  function axiosErrorFrom(fixture: { status: number; body: unknown }): AxiosError {
    const error = new AxiosError('Request failed');
    error.response = {
      status: fixture.status,
      data: fixture.body,
      statusText: '',
      headers: {},
      config: { headers: new AxiosHeaders() },
    };
    return error;
  }

  it('affiche le message d’une 401 tel que l’API le formule', () => {
    const error = toAppError(axiosErrorFrom(responses.error_401));

    expect(error.status).toBe(401);
    expect(error.message).toBe('Email ou mot de passe incorrect.');
    expect(error.isNetworkError).toBe(false);
  });

  it('extrait les erreurs par champ d’une 422 FastAPI réelle', () => {
    const error = toAppError(axiosErrorFrom(responses.error_422));

    // La réponse réelle porte aussi type/input/ctx : le parseur doit les ignorer.
    expect(error.status).toBe(422);
    expect(Object.keys(error.fieldErrors ?? {})).toEqual(
      expect.arrayContaining(['email', 'password']),
    );
    expect(error.fieldErrors?.email).toMatch(/email/i);
  });
});
