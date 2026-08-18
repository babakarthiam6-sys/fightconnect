import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS } from '@/constants/api';
import { http, restoreAuthToken, setAuthToken } from '@/services/api';
import { authService } from '@/services/auth';

jest.mock('@/services/api', () => ({
  http: { get: jest.fn(), post: jest.fn() },
  setAuthToken: jest.fn(),
  restoreAuthToken: jest.fn(),
}));

const mockedHttp = http as jest.Mocked<typeof http>;
const mockedRestore = restoreAuthToken as jest.MockedFunction<typeof restoreAuthToken>;
const mockedSetToken = setAuthToken as jest.MockedFunction<typeof setAuthToken>;

const API_USER = {
  _id: 'u1',
  email: 'jean@exemple.com',
  first_name: 'Jean',
  last_name: 'Dupont',
  discharge_accepted: true,
};

describe('service d’authentification', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('accepte les différents noms de champ du token', async () => {
    for (const payload of [
      { access_token: 't1', user: API_USER },
      { accessToken: 't2', user: API_USER },
      { token: 't3', user: API_USER },
    ]) {
      mockedHttp.post.mockResolvedValueOnce(payload);
      const session = await authService.login({ email: 'a@b.co', password: 'x' });
      expect(session.token).toMatch(/^t\d$/);
    }
  });

  it('persiste le token et le profil après connexion', async () => {
    mockedHttp.post.mockResolvedValue({ access_token: 'jwt', user: API_USER });

    await authService.login({ email: 'jean@exemple.com', password: 'Sparring1' });

    expect(mockedSetToken).toHaveBeenCalledWith('jwt');
    expect(await AsyncStorage.getItem(STORAGE_KEYS.token)).toBe('jwt');
    expect(await AsyncStorage.getItem(STORAGE_KEYS.user)).toContain('jean@exemple.com');
  });

  it('récupère le profil via /auth/me si la connexion ne le renvoie pas', async () => {
    mockedHttp.post.mockResolvedValue({ access_token: 'jwt' });
    mockedHttp.get.mockResolvedValue(API_USER);

    const session = await authService.login({ email: 'jean@exemple.com', password: 'x' });

    expect(mockedHttp.get).toHaveBeenCalledWith('/auth/me');
    expect(session.user.firstName).toBe('Jean');
  });

  it('rejette une réponse sans token', async () => {
    mockedHttp.post.mockResolvedValue({ user: API_USER });

    await expect(authService.login({ email: 'a@b.co', password: 'x' })).rejects.toMatchObject({
      message: expect.stringContaining('token'),
    });
  });

  it('enchaîne sur un login si l’inscription n’authentifie pas', async () => {
    mockedHttp.post
      .mockResolvedValueOnce({ user: API_USER })
      .mockResolvedValueOnce({ access_token: 'jwt', user: API_USER });

    const session = await authService.signup({
      email: 'jean@exemple.com',
      password: 'Sparring1',
      firstName: 'Jean',
      lastName: 'Dupont',
      dischargeAccepted: true,
    });

    expect(mockedHttp.post).toHaveBeenNthCalledWith(2, '/auth/login', expect.anything());
    expect(session.token).toBe('jwt');
  });

  it('sans token stocké, aucune session à restaurer', async () => {
    mockedRestore.mockResolvedValue(null);
    await expect(authService.restore()).resolves.toBeNull();
    expect(mockedHttp.get).not.toHaveBeenCalled();
  });

  it('garde l’utilisateur connecté hors ligne grâce au profil en cache', async () => {
    mockedRestore.mockResolvedValue('jwt');
    await AsyncStorage.setItem(
      STORAGE_KEYS.user,
      JSON.stringify({ id: 'u1', firstName: 'Jean', email: 'jean@exemple.com' }),
    );
    mockedHttp.get.mockRejectedValue({ isNetworkError: true, status: null });

    const session = await authService.restore();

    expect(session?.token).toBe('jwt');
    expect(session?.user.firstName).toBe('Jean');
  });

  it('purge la session sur un token rejeté (401)', async () => {
    mockedRestore.mockResolvedValue('jwt-expire');
    await AsyncStorage.setItem(STORAGE_KEYS.token, 'jwt-expire');
    mockedHttp.get.mockRejectedValue({ status: 401, isNetworkError: false });

    await expect(authService.restore()).resolves.toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.token)).toBeNull();
  });

  it('efface le cache métier à la déconnexion', async () => {
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.token, 'jwt'],
      [STORAGE_KEYS.sparringsCache, '[]'],
      [STORAGE_KEYS.paymentsCache, '[]'],
    ]);

    await authService.logout();

    expect(await AsyncStorage.getItem(STORAGE_KEYS.token)).toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.sparringsCache)).toBeNull();
    expect(mockedSetToken).toHaveBeenCalledWith(null);
  });
});
