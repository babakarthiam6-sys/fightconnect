import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import Button from '@/components/Button';
import RatingStars from '@/components/RatingStars';
import SparringCard from '@/components/SparringCard';
import UserProfile from '@/components/UserProfile';
import type { Sparring, User } from '@/types';

const SPARRING: Sparring = {
  id: 's1',
  title: 'Sparring boxe technique',
  description: 'Séance technique à intensité modérée.',
  location: 'Paris 11e',
  scheduledAt: '2030-05-12T18:30:00.000Z',
  durationMinutes: 90,
  level: 'advanced',
  style: 'muay_thai',
  price: 25,
  currency: 'EUR',
  maxParticipants: 4,
  participants: [
    { id: 'u2', firstName: 'Ada', lastName: 'Lovelace', avatarUrl: null, averageRating: 5 },
  ],
  creator: { id: 'u1', firstName: 'Jean', lastName: 'Dupont', avatarUrl: null, averageRating: 4.5 },
  status: 'open',
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

describe('SparringCard', () => {
  it('affiche le prix, la discipline et le niveau traduits', () => {
    render(<SparringCard sparring={SPARRING} onPress={jest.fn()} />);

    expect(screen.getByText(/25/)).toBeTruthy();
    expect(screen.getByText('Muay-thaï')).toBeTruthy();
    expect(screen.getByText('Avancé')).toBeTruthy();
  });

  it('indique les places restantes', () => {
    render(<SparringCard sparring={SPARRING} onPress={jest.fn()} />);
    expect(screen.getByText('3 places')).toBeTruthy();
  });

  it('bascule sur « Complet » quand le quota est atteint', () => {
    const full: Sparring = {
      ...SPARRING,
      maxParticipants: 1,
    };
    render(<SparringCard sparring={full} onPress={jest.fn()} />);

    expect(screen.getByText('Complet')).toBeTruthy();
  });

  it('abrège le nom de l’organisateur', () => {
    render(<SparringCard sparring={SPARRING} onPress={jest.fn()} />);
    expect(screen.getByText('Jean D.')).toBeTruthy();
  });

  it('transmet le sparring au callback', () => {
    const onPress = jest.fn();
    render(<SparringCard sparring={SPARRING} onPress={onPress} />);

    fireEvent.press(screen.getByLabelText('Sparring Sparring boxe technique'));
    expect(onPress).toHaveBeenCalledWith(SPARRING);
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
