import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import PaymentForm from '@/components/PaymentForm';
import { paymentService } from '@/services/payment';
import type { Booking } from '@/types';

const mockStripe = {
  configured: true,
  init: jest.fn(),
  present: jest.fn(),
};

jest.mock('@stripe/stripe-react-native', () => ({
  useStripe: () => ({
    initPaymentSheet: mockStripe.init,
    presentPaymentSheet: mockStripe.present,
  }),
}));

jest.mock('@/constants/config', () => ({
  // Getter : la valeur est relue à chaque accès, ce qui permet de basculer la
  // configuration Stripe d'un test à l'autre.
  get IS_STRIPE_CONFIGURED() {
    return mockStripe.configured;
  },
  CONFIG: { maxReviewLength: 1000, minPasswordLength: 8 },
}));

jest.mock('@/services/payment', () => ({
  paymentService: { createIntent: jest.fn(), history: jest.fn() },
}));

const mockedPayment = paymentService as jest.Mocked<typeof paymentService>;

const BOOKING: Booking = {
  id: 'b1',
  requester: null,
  partner: {
    id: 'p1',
    firstName: 'Luis',
    lastName: 'Dupont',
    avatarUrl: null,
    averageRating: null,
    city: 'Valence',
    pricePerRound: 25,
  },
  scheduledAt: '2030-05-12T18:30:00.000Z',
  rounds: 1,
  pricePerRound: 25,
  total: 25,
  commission: 3.75,
  payout: 21.25,
  currency: 'EUR',
  status: 'accepted',
  paid: false,
  reviewed: false,
  createdAt: null,
};

const INTENT = {
  clientSecret: 'pi_secret',
  paymentIntentId: 'pi_1',
  ephemeralKey: null,
  customerId: null,
  publishableKey: null,
  amount: 25,
  currency: 'EUR',
};

describe('PaymentForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStripe.configured = true;
    mockStripe.init.mockResolvedValue({});
    mockStripe.present.mockResolvedValue({});
    mockedPayment.createIntent.mockResolvedValue(INTENT);
  });

  it('affiche le montant à régler', () => {
    render(<PaymentForm booking={BOOKING} onSuccess={jest.fn()} />);
    expect(screen.getByText(/25/)).toBeTruthy();
  });

  it('enchaîne PaymentIntent puis Payment Sheet, et confirme', async () => {
    const onSuccess = jest.fn();
    render(<PaymentForm booking={BOOKING} onSuccess={onSuccess} />);

    fireEvent.press(screen.getByText('Payer et rejoindre'));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(mockedPayment.createIntent).toHaveBeenCalledWith('b1');
    expect(mockStripe.init).toHaveBeenCalledWith(
      expect.objectContaining({ paymentIntentClientSecret: 'pi_secret' }),
    );
  });

  it('traite une fermeture de la feuille comme une non-erreur', async () => {
    const onSuccess = jest.fn();
    const onError = jest.fn();
    mockStripe.present.mockResolvedValue({ error: { code: 'Canceled', message: 'annulé' } });

    render(<PaymentForm booking={BOOKING} onSuccess={onSuccess} onError={onError} />);
    fireEvent.press(screen.getByText('Payer et rejoindre'));

    await waitFor(() => expect(mockStripe.present).toHaveBeenCalled());
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('remonte une erreur de paiement', async () => {
    const onError = jest.fn();
    mockStripe.present.mockResolvedValue({ error: { code: 'Failed', message: 'Carte refusée' } });

    render(<PaymentForm booking={BOOKING} onSuccess={jest.fn()} onError={onError} />);
    fireEvent.press(screen.getByText('Payer et rejoindre'));

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(screen.getByText('Carte refusée')).toBeTruthy();
  });

  it('propage l’échec de création du PaymentIntent', async () => {
    const onError = jest.fn();
    mockedPayment.createIntent.mockRejectedValue({
      message: 'Le serveur n’a pas renvoyé de client_secret Stripe.',
      status: null,
      isNetworkError: false,
      fieldErrors: null,
    });

    render(<PaymentForm booking={BOOKING} onSuccess={jest.fn()} onError={onError} />);
    fireEvent.press(screen.getByText('Payer et rejoindre'));

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(mockStripe.init).not.toHaveBeenCalled();
  });

  it('refuse de payer sans clé publique configurée', async () => {
    mockStripe.configured = false;
    const onError = jest.fn();

    render(<PaymentForm booking={BOOKING} onSuccess={jest.fn()} onError={onError} />);
    fireEvent.press(screen.getByText('Payer et rejoindre'));

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(mockedPayment.createIntent).not.toHaveBeenCalled();
    expect(screen.getByText(/clé publique Stripe non configurée/)).toBeTruthy();
  });
});
