import React from 'react';
import { Pressable, Text } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { setUnauthorizedHandler } from '@/services/api';
import { authService } from '@/services/auth';

jest.mock('@/services/auth', () => ({
  authService: {
    restore: jest.fn(),
    login: jest.fn(),
    signup: jest.fn(),
    logout: jest.fn(),
    me: jest.fn(),
  },
}));

jest.mock('@/services/api', () => ({ setUnauthorizedHandler: jest.fn() }));

const mockedAuth = authService as jest.Mocked<typeof authService>;
const mockedSetHandler = setUnauthorizedHandler as jest.MockedFunction<typeof setUnauthorizedHandler>;

const USER = {
  id: 'u1',
  email: 'jean@exemple.com',
  firstName: 'Jean',
  lastName: 'Dupont',
  avatarUrl: null,
  dischargeAccepted: true,
  averageRating: null,
  ratingsCount: 0,
  createdAt: null,
  payoutsEnabled: false,
  expoPushToken: null,
  city: null,
  bio: null,
  style: null,
  level: null,
  weightClass: null,
  heightCm: null,
  fightsCount: 0,
  experienceYears: 0,
  pricePerRound: null,
  currency: 'EUR',
  available: false,
};

function Probe() {
  const { user, isAuthenticated, isBootstrapping, error, login, logout } = useAuth();

  if (isBootstrapping) return <Text>bootstrap</Text>;

  return (
    <>
      <Text>{isAuthenticated ? `connecté:${user?.firstName}` : 'anonyme'}</Text>
      {error ? <Text>{`erreur:${error.message}`}</Text> : null}
      <Pressable
        testID="login"
        onPress={() => void login({ email: 'jean@exemple.com', password: 'Sparring1' })}
      >
        <Text>login</Text>
      </Pressable>
      <Pressable testID="logout" onPress={() => void logout()}>
        <Text>logout</Text>
      </Pressable>
    </>
  );
}

function renderProbe() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.logout.mockResolvedValue(undefined);
  });

  it('restaure une session existante au démarrage', async () => {
    mockedAuth.restore.mockResolvedValue({ token: 'jwt', user: USER });

    renderProbe();

    expect(screen.getByText('bootstrap')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('connecté:Jean')).toBeTruthy());
  });

  it('reste anonyme quand aucune session n’est stockée', async () => {
    mockedAuth.restore.mockResolvedValue(null);

    renderProbe();

    await waitFor(() => expect(screen.getByText('anonyme')).toBeTruthy());
  });

  it('connecte l’utilisateur', async () => {
    mockedAuth.restore.mockResolvedValue(null);
    mockedAuth.login.mockResolvedValue({ token: 'jwt', user: USER });

    renderProbe();
    await waitFor(() => expect(screen.getByText('anonyme')).toBeTruthy());

    fireEvent.press(screen.getByTestId('login'));

    await waitFor(() => expect(screen.getByText('connecté:Jean')).toBeTruthy());
  });

  it('expose l’erreur sans perdre l’état anonyme', async () => {
    mockedAuth.restore.mockResolvedValue(null);
    mockedAuth.login.mockRejectedValue({
      message: 'Identifiants invalides',
      status: 401,
      isNetworkError: false,
      fieldErrors: null,
    });

    renderProbe();
    await waitFor(() => expect(screen.getByText('anonyme')).toBeTruthy());

    fireEvent.press(screen.getByTestId('login'));

    await waitFor(() => expect(screen.getByText('erreur:Identifiants invalides')).toBeTruthy());
    expect(screen.getByText('anonyme')).toBeTruthy();
  });

  it('déconnecte et purge la session', async () => {
    mockedAuth.restore.mockResolvedValue({ token: 'jwt', user: USER });

    renderProbe();
    await waitFor(() => expect(screen.getByText('connecté:Jean')).toBeTruthy());

    fireEvent.press(screen.getByTestId('logout'));

    await waitFor(() => expect(screen.getByText('anonyme')).toBeTruthy());
    expect(mockedAuth.logout).toHaveBeenCalled();
  });

  it('déconnecte quand l’intercepteur signale un 401', async () => {
    mockedAuth.restore.mockResolvedValue({ token: 'jwt', user: USER });

    renderProbe();
    await waitFor(() => expect(screen.getByText('connecté:Jean')).toBeTruthy());

    // Le handler enregistré par le contexte est celui que l'intercepteur appelle.
    const handler = mockedSetHandler.mock.calls
      .map(([callback]) => callback)
      .filter((callback): callback is () => void => typeof callback === 'function')
      .pop();
    expect(handler).toBeDefined();

    await act(async () => {
      handler?.();
    });

    await waitFor(() => expect(screen.getByText('anonyme')).toBeTruthy());
  });
});
