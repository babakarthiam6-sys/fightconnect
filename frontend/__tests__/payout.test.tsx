import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import PayoutCard from '@/components/PayoutCard';
import { http } from '@/services/api';
import { payoutService } from '@/services/payout';
import type { PayoutStatus } from '@/types';

jest.mock('@/services/api', () => ({ http: { get: jest.fn(), post: jest.fn() } }));

const mockedHttp = http as jest.Mocked<typeof http>;

const CONFIGURE: PayoutStatus = {
  connected: false,
  detailsSubmitted: false,
  payoutsEnabled: false,
  stripeConfigured: true,
};

describe('service de versements', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lit la réponse snake_case du serveur', async () => {
    mockedHttp.get.mockResolvedValue({
      connected: true,
      details_submitted: true,
      payouts_enabled: true,
      stripe_configured: true,
    });

    await expect(payoutService.status()).resolves.toEqual({
      connected: true,
      detailsSubmitted: true,
      payoutsEnabled: true,
      stripeConfigured: true,
    });
  });

  it('n’échoue jamais : un statut illisible devient « non configuré »', async () => {
    mockedHttp.get.mockRejectedValue({ message: 'boom' });

    // L'écran Profil doit rester affichable même sans cette information.
    await expect(payoutService.status()).resolves.toMatchObject({ payoutsEnabled: false });
  });

  it('renvoie le lien d’inscription', async () => {
    mockedHttp.post.mockResolvedValue({ url: 'https://connect.stripe.com/setup/abc' });

    await expect(payoutService.onboardingUrl()).resolves.toBe(
      'https://connect.stripe.com/setup/abc',
    );
  });

  it('refuse un lien absent ou non conforme', async () => {
    mockedHttp.post.mockResolvedValue({ url: 'javascript:alert(1)' });

    await expect(payoutService.onboardingUrl()).rejects.toMatchObject({
      message: expect.stringContaining('lien Stripe'),
    });
  });
});

describe('carte de versements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });

  it('invite à configurer quand rien n’est fait', () => {
    render(<PayoutCard status={CONFIGURE} onChanged={jest.fn()} />);

    expect(screen.getByText('À configurer')).toBeTruthy();
    expect(screen.getByText(/personne ne peut réserver/)).toBeTruthy();
  });

  it('distingue une vérification en cours d’un compte jamais commencé', () => {
    render(
      <PayoutCard
        status={{ ...CONFIGURE, connected: true, detailsSubmitted: true }}
        onChanged={jest.fn()}
      />,
    );

    expect(screen.getByText('Vérification en cours')).toBeTruthy();
  });

  it('confirme quand les versements sont actifs', () => {
    render(
      <PayoutCard status={{ ...CONFIGURE, payoutsEnabled: true }} onChanged={jest.fn()} />,
    );

    expect(screen.getByText('Actif')).toBeTruthy();
    expect(screen.queryByText('Configurer mes versements')).toBeNull();
  });

  it('se tait si la plateforme n’a pas de clé Stripe', () => {
    render(
      <PayoutCard status={{ ...CONFIGURE, stripeConfigured: false }} onChanged={jest.fn()} />,
    );

    expect(screen.getByText(/pas encore activés/)).toBeTruthy();
    expect(screen.queryByText('Configurer mes versements')).toBeNull();
  });

  it('ouvre le lien Stripe et prévient le parent', async () => {
    mockedHttp.post.mockResolvedValue({ url: 'https://connect.stripe.com/setup/abc' });
    const onChanged = jest.fn();

    render(<PayoutCard status={CONFIGURE} onChanged={onChanged} />);
    fireEvent.press(screen.getByText('Configurer mes versements'));

    await waitFor(() =>
      expect(Linking.openURL).toHaveBeenCalledWith('https://connect.stripe.com/setup/abc'),
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it('remonte l’erreur sans ouvrir de lien', async () => {
    mockedHttp.post.mockRejectedValue({ message: 'Stripe indisponible' });
    const onError = jest.fn();

    render(<PayoutCard status={CONFIGURE} onChanged={jest.fn()} onError={onError} />);
    fireEvent.press(screen.getByText('Configurer mes versements'));

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(Linking.openURL).not.toHaveBeenCalled();
  });
});
