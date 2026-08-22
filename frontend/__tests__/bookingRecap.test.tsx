import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import BookingScreen from '@/app/booking/[id]';
import PartnerScreen from '@/app/partner/[id]';
import RatingStars from '@/components/RatingStars';
import { partnerService } from '@/services/partner';
import type { Partner } from '@/types';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'p1' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/services/partner', () => ({ partnerService: { detail: jest.fn() } }));
jest.mock('@/context/AppContext', () => ({ useApp: () => ({ invalidateBookings: jest.fn() }) }));

const detail = partnerService.detail as jest.MockedFunction<typeof partnerService.detail>;

const LUIS: Partner = {
  id: 'p1',
  firstName: 'Luis',
  lastName: 'Boxeur',
  avatarUrl: null,
  averageRating: null,
  ratingsCount: 0,
  payoutsEnabled: true,
  city: 'Valence',
  bio: 'Boxeur amateur.',
  style: 'boxing',
  level: 'amateur',
  weightClass: 'middleweight',
  heightCm: 178,
  fightsCount: 15,
  experienceYears: 5,
  pricePerRound: 20,
  currency: 'EUR',
  available: true,
};

/** Les espaces insécables de `Intl` rendent les comparaisons brutes illisibles. */
function lisible(texte: string): string {
  return texte.replace(/[\u00a0\u202f\u2009]/g, ' ');
}

async function ouvreLaReservation(partner: Partner = LUIS) {
  detail.mockResolvedValue(partner);
  render(<BookingScreen />);
  await waitFor(() => expect(screen.getByTestId('booking-total')).toBeTruthy());
}

describe('récapitulatif de réservation', () => {
  beforeEach(() => jest.clearAllMocks());

  /**
   * Le grief d'origine : « 40 € » puis « 6 € » puis « Total 40 € » se lit comme
   * une erreur de calcul. La commission doit être signée en négatif et suivie
   * de ce qu'il reste au partenaire, pour que le total tombe juste à la lecture.
   */
  it('à 2 rounds × 20 €, affiche 40 € / −6,00 € / 34,00 € / 40 €', async () => {
    await ouvreLaReservation();

    expect(lisible(screen.getByTestId('booking-commission').props.children)).toBe('−6,00 €');
    expect(lisible(screen.getByTestId('booking-payout').props.children)).toBe('34,00 €');
    expect(lisible(screen.getByTestId('booking-total').props.children)).toBe('40 €');
    expect(screen.getByText(/La commission est prélevée sur la part du partenaire/)).toBeTruthy();
  });

  it('à 3 rounds × 20 €, affiche 60 € / −9,00 € / 51,00 € / 60 €', async () => {
    await ouvreLaReservation();
    fireEvent.press(screen.getByLabelText('Ajouter un round'));

    await waitFor(() =>
      expect(lisible(screen.getByTestId('booking-total').props.children)).toBe('60 €'),
    );
    expect(lisible(screen.getByTestId('booking-commission').props.children)).toBe('−9,00 €');
    expect(lisible(screen.getByTestId('booking-payout').props.children)).toBe('51,00 €');
  });

  /** La commission est prise sur la part du partenaire, jamais ajoutée au total. */
  it('garde le total égal au tarif annoncé × le nombre de rounds', async () => {
    await ouvreLaReservation();

    const total = lisible(screen.getByTestId('booking-total').props.children);
    expect(lisible(screen.getByText(/2 rounds ×/).props.children.join(''))).toContain('20 €');
    expect(total).toBe('40 €');
  });

  it('écrit « 1 round » au singulier, sans « s » nulle part', async () => {
    await ouvreLaReservation();
    fireEvent.press(screen.getByLabelText('Retirer un round'));

    await waitFor(() =>
      expect(lisible(screen.getByTestId('booking-total').props.children)).toBe('20 €'),
    );
    expect(screen.getAllByText('round').length).toBeGreaterThan(0);
    expect(screen.queryByText('rounds')).toBeNull();
    expect(screen.queryByText(/1 rounds/)).toBeNull();
  });
});

describe('étoiles d’un profil sans avis', () => {
  it('n’affiche aucune étoile à zéro avis', () => {
    render(<RatingStars value={0} ratingsCount={0} />);
    expect(screen.queryAllByText(/star/)).toHaveLength(0);
  });

  it('affiche les étoiles dès qu’il y a un avis', () => {
    render(<RatingStars value={4} ratingsCount={3} />);
    expect(screen.queryAllByText(/star/).length).toBe(5);
  });
});

describe('fiche partenaire', () => {
  beforeEach(() => jest.clearAllMocks());

  it('prévient quand les versements ne sont pas configurés', async () => {
    detail.mockResolvedValue({ ...LUIS, payoutsEnabled: false });
    render(<PartnerScreen />);

    await waitFor(() => expect(screen.getByTestId('partner-no-payouts')).toBeTruthy());
    expect(screen.getByText(/n’a pas encore activé les paiements/)).toBeTruthy();
  });

  it('ne dit rien quand ils le sont', async () => {
    detail.mockResolvedValue(LUIS);
    render(<PartnerScreen />);

    await waitFor(() => expect(screen.getByTestId('partner-book')).toBeTruthy());
    expect(screen.queryByTestId('partner-no-payouts')).toBeNull();
  });
});
