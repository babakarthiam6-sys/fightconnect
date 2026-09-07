import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import Button from '@/components/Button';
import RatingStars from '@/components/RatingStars';
import BookingCard from '@/components/BookingCard';
import PartnerCard from '@/components/PartnerCard';
import UserProfile from '@/components/UserProfile';
import type { Booking, Partner, User } from '@/types';

const PARTNER: Partner = {
  id: 'p1',
  firstName: 'Luis',
  lastName: 'Dupont',
  avatarUrl: null,
  averageRating: null,
  ratingsCount: 0,
  city: 'Valence',
  bio: 'Boxeur amateur.',
  style: 'muay_thai',
  level: 'amateur',
  weightClass: 'middleweight',
  heightCm: 178,
  fightsCount: 15,
  experienceYears: 5,
  pricePerRound: 20,
  currency: 'EUR',
  available: true,
  videos: [],
};

const BOOKING: Booking = {
  id: 'b1',
  requester: {
    id: 'u2',
    firstName: 'Ana',
    lastName: 'Martin',
    avatarUrl: null,
    averageRating: null,
    city: null,
    pricePerRound: null,
  },
  partner: {
    id: 'p1',
    firstName: 'Luis',
    lastName: 'Dupont',
    avatarUrl: null,
    averageRating: null,
    city: 'Valence',
    pricePerRound: 20,
  },
  scheduledAt: '2030-05-12T18:30:00.000Z',
  rounds: 2,
  pricePerRound: 20,
  total: 40,
  commission: 6,
  payout: 34,
  currency: 'EUR',
  status: 'pending',
  paid: false,
  reviewed: false,
  createdAt: null,
};

const USER: User = {
  id: 'u1',
  email: 'jean@exemple.com',
  firstName: 'Jean',
  lastName: 'Dupont',
  avatarUrl: null,
  dischargeAccepted: true,
  averageRating: 4.5,
  ratingsCount: 12,
  createdAt: null,
  payoutsEnabled: false,
  expoPushToken: null,
  city: 'Valence',
  bio: null,
  style: 'boxing',
  level: 'amateur',
  weightClass: 'middleweight',
  heightCm: 178,
  fightsCount: 3,
  experienceYears: 2,
  pricePerRound: 20,
  currency: 'EUR',
  available: true,
  videos: [],
};

describe('Button', () => {
  it('déclenche onPress au toucher', () => {
    const onPress = jest.fn();
    render(<Button label="Payer" onPress={onPress} testID="cta" />);

    fireEvent.press(screen.getByTestId('cta'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignore les appuis pendant le chargement', () => {
    const onPress = jest.fn();
    render(<Button label="Payer" onPress={onPress} loading testID="cta" />);

    fireEvent.press(screen.getByTestId('cta'));
    expect(onPress).not.toHaveBeenCalled();
    // Le libellé cède la place à l'indicateur : pas de double soumission possible.
    expect(screen.queryByText('Payer')).toBeNull();
  });

  it('ignore les appuis quand il est désactivé', () => {
    const onPress = jest.fn();
    render(<Button label="Payer" onPress={onPress} disabled testID="cta" />);

    fireEvent.press(screen.getByTestId('cta'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('PartnerCard', () => {
  it('affiche le tarif, la discipline et le niveau traduits', () => {
    render(<PartnerCard partner={PARTNER} onPress={jest.fn()} />);

    expect(screen.getByText(/20/)).toBeTruthy();
    expect(screen.getByText('Muay-thaï')).toBeTruthy();
    expect(screen.getByText('Amateur')).toBeTruthy();
  });

  it('signale un profil sans avis plutôt qu’une note de zéro', () => {
    // Afficher « 0,0 » ferait passer un nouveau venu pour un mauvais partenaire.
    render(<PartnerCard partner={PARTNER} onPress={jest.fn()} />);
    expect(screen.getByText('Nouveau')).toBeTruthy();
  });

  it('affiche la note dès qu’il y a des avis', () => {
    render(
      <PartnerCard
        partner={{ ...PARTNER, averageRating: 4.5, ratingsCount: 12 }}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText('4.5 (12)')).toBeTruthy();
  });

  it('abrège le nom du partenaire', () => {
    render(<PartnerCard partner={PARTNER} onPress={jest.fn()} />);
    expect(screen.getByText('Luis D.')).toBeTruthy();
  });

  it('transmet le partenaire au callback', () => {
    const onPress = jest.fn();
    render(<PartnerCard partner={PARTNER} onPress={onPress} />);

    fireEvent.press(screen.getByLabelText('Partenaire Luis D.'));
    expect(onPress).toHaveBeenCalledWith(PARTNER);
  });
});

describe('BookingCard', () => {
  it('propose d’accepter ou refuser une demande reçue', () => {
    const onAccept = jest.fn();
    render(<BookingCard booking={BOOKING} direction="received" onAccept={onAccept} />);

    fireEvent.press(screen.getByText('Accepter'));
    expect(onAccept).toHaveBeenCalledWith(BOOKING);
    expect(screen.getByText('Refuser')).toBeTruthy();
  });

  it('ne propose pas d’accepter sa propre demande', () => {
    render(<BookingCard booking={BOOKING} direction="sent" />);
    expect(screen.queryByText('Accepter')).toBeNull();
  });

  it('propose de payer une demande acceptée et impayée', () => {
    render(
      <BookingCard booking={{ ...BOOKING, status: 'accepted' }} direction="sent" onPay={jest.fn()} />,
    );
    expect(screen.getByText('Payer')).toBeTruthy();
  });

  it('ne repropose pas de payer une demande déjà réglée', () => {
    render(
      <BookingCard booking={{ ...BOOKING, status: 'accepted', paid: true }} direction="sent" />,
    );

    expect(screen.queryByText('Payer')).toBeNull();
    expect(screen.getByText('Payée')).toBeTruthy();
  });

  it('n’offre plus aucune action sur une demande close', () => {
    render(<BookingCard booking={{ ...BOOKING, status: 'declined' }} direction="sent" />);

    expect(screen.queryByText('Annuler')).toBeNull();
    expect(screen.getByText('Refusée')).toBeTruthy();
  });

  it('affiche le décompte de la demande', () => {
    render(<BookingCard booking={BOOKING} direction="sent" />);
    expect(screen.getByText(/2 rounds/)).toBeTruthy();
  });
});

describe('RatingStars', () => {
  it('remonte la note choisie', () => {
    const onChange = jest.fn();
    render(<RatingStars value={0} onChange={onChange} />);

    fireEvent.press(screen.getByLabelText('Noter 4 sur 5'));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('n’est pas interactif sans onChange', () => {
    render(<RatingStars value={3} />);
    expect(screen.queryByLabelText('Noter 3 sur 5')).toBeNull();
  });
});

describe('UserProfile', () => {
  it('signale une décharge non signée', () => {
    render(<UserProfile user={{ ...USER, dischargeAccepted: false }} />);
    expect(screen.getByText('Décharge à signer')).toBeTruthy();
  });

  it('affiche le profil de risque renvoyé par la modération', () => {
    render(
      <UserProfile
        user={USER}
        riskProfile={{ userId: 'u1', riskLevel: 'high', score: 0.9, reasons: ['Avis signalés'] }}
      />,
    );

    expect(screen.getByText('Profil à risque')).toBeTruthy();
    expect(screen.getByText('Avis signalés')).toBeTruthy();
  });

  it('masque l’email pour un tiers', () => {
    render(<UserProfile user={USER} showEmail={false} />);
    expect(screen.queryByText('jean@exemple.com')).toBeNull();
  });
});
