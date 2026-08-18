import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import LoginScreen from '@/app/(auth)/login';
import { useAuth } from '@/context/AuthContext';

jest.mock('expo-router', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Link: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  };
});

jest.mock('@/context/AuthContext', () => ({ useAuth: jest.fn() }));

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const login = jest.fn();

function mockAuthState(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  mockedUseAuth.mockReturnValue({
    user: null,
    token: null,
    isBootstrapping: false,
    isSubmitting: false,
    error: null,
    isAuthenticated: false,
    login,
    signup: jest.fn(),
    logout: jest.fn(),
    refreshUser: jest.fn(),
    clearError: jest.fn(),
    ...overrides,
  } as ReturnType<typeof useAuth>);
}

describe('écran de connexion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    login.mockResolvedValue(true);
    mockAuthState();
  });

  it('bloque la soumission et affiche les erreurs de saisie', async () => {
    render(<LoginScreen />);

    fireEvent.press(screen.getByTestId('login-submit'));

    await waitFor(() => expect(screen.getByText('L’email est obligatoire.')).toBeTruthy());
    expect(screen.getByText('Le mot de passe est obligatoire.')).toBeTruthy();
    expect(login).not.toHaveBeenCalled();
  });

  it('signale un email mal formé', async () => {
    render(<LoginScreen />);

    fireEvent.changeText(screen.getByTestId('login-email'), 'jean@');
    fireEvent.changeText(screen.getByTestId('login-password'), 'Sparring1');
    fireEvent.press(screen.getByTestId('login-submit'));

    await waitFor(() => expect(screen.getByText('Format d’email invalide.')).toBeTruthy());
    expect(login).not.toHaveBeenCalled();
  });

  it('normalise l’email avant de le transmettre', async () => {
    render(<LoginScreen />);

    fireEvent.changeText(screen.getByTestId('login-email'), '  Jean@Exemple.COM ');
    fireEvent.changeText(screen.getByTestId('login-password'), 'Sparring1');
    fireEvent.press(screen.getByTestId('login-submit'));

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith({ email: 'jean@exemple.com', password: 'Sparring1' }),
    );
  });

  it('désactive le bouton pendant la soumission', () => {
    mockAuthState({ isSubmitting: true });
    render(<LoginScreen />);

    fireEvent.press(screen.getByTestId('login-submit'));
    expect(login).not.toHaveBeenCalled();
  });

  it('rend le mot de passe masqué par défaut', () => {
    render(<LoginScreen />);
    expect(screen.getByTestId('login-password').props.secureTextEntry).toBe(true);
    expect(screen.getByLabelText('Afficher le mot de passe')).toBeTruthy();
  });
});
