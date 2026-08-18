import { ENDPOINTS, STORAGE_KEYS } from '@/constants/api';
import { http, restoreAuthToken, setAuthToken } from '@/services/api';
import { asRecord, normalizeUser } from '@/utils/normalize';
import { storage } from '@/utils/storage';
import type { AuthSession, User } from '@/types';
import type { LoginInput, SignupInput } from '@/utils/validation';

function extractToken(payload: unknown): string {
  const raw = asRecord(payload);
  for (const key of ['access_token', 'accessToken', 'token', 'jwt']) {
    const value = raw[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}

async function persistSession(token: string, user: User): Promise<void> {
  setAuthToken(token);
  await storage.setString(STORAGE_KEYS.token, token);
  await storage.setObject(STORAGE_KEYS.user, user);
}

export const authService = {
  async signup(input: SignupInput): Promise<AuthSession> {
    const payload = await http.post<unknown>(ENDPOINTS.auth.signup, {
      email: input.email,
      password: input.password,
      first_name: input.firstName,
      last_name: input.lastName,
      discharge_accepted: input.dischargeAccepted,
    });

    const token = extractToken(payload);
    // Certaines API renvoient l'utilisateur à la racine, d'autres sous `user`.
    const userPayload = asRecord(payload)['user'] ?? payload;
    let user = normalizeUser(userPayload);

    if (token) {
      setAuthToken(token);
      // Si l'inscription ne renvoie pas le profil complet, on le récupère.
      if (!user.id || !user.email) {
        user = await authService.me();
      }
      await persistSession(token, user);
      return { token, user };
    }

    // Backend qui n'authentifie pas à l'inscription : on enchaîne sur un login.
    return authService.login({ email: input.email, password: input.password });
  },

  async login(input: LoginInput): Promise<AuthSession> {
    const payload = await http.post<unknown>(ENDPOINTS.auth.login, {
      email: input.email,
      password: input.password,
    });

    const token = extractToken(payload);
    if (!token) {
      throw {
        message: 'Réponse d’authentification invalide (token manquant).',
        status: null,
        isNetworkError: false,
        fieldErrors: null,
      };
    }

    setAuthToken(token);
    const userPayload = asRecord(payload)['user'];
    const user = userPayload ? normalizeUser(userPayload) : await authService.me();

    await persistSession(token, user);
    return { token, user };
  },

  async me(): Promise<User> {
    const payload = await http.get<unknown>(ENDPOINTS.auth.me);
    const raw = asRecord(payload);
    return normalizeUser(raw['user'] ?? payload);
  },

  /**
   * Restaure la session au démarrage.
   *
   * Le profil en cache est renvoyé immédiatement si le réseau est absent, pour
   * éviter d'éjecter l'utilisateur vers l'écran de login en mode avion.
   */
  async restore(): Promise<AuthSession | null> {
    const token = await restoreAuthToken();
    if (!token) return null;

    const cachedUser = await storage.getObject<User>(STORAGE_KEYS.user);

    try {
      const user = await authService.me();
      await storage.setObject(STORAGE_KEYS.user, user);
      return { token, user };
    } catch (error) {
      const status = (error as { status?: number | null }).status ?? null;
      const isNetworkError = (error as { isNetworkError?: boolean }).isNetworkError === true;

      if (status === 401 || status === 403) {
        await authService.logout();
        return null;
      }
      if (cachedUser && isNetworkError) return { token, user: cachedUser };
      if (cachedUser) return { token, user: cachedUser };
      return null;
    }
  },

  async logout(): Promise<void> {
    setAuthToken(null);
    await storage.removeMany([
      STORAGE_KEYS.token,
      STORAGE_KEYS.user,
      STORAGE_KEYS.sparringsCache,
      STORAGE_KEYS.paymentsCache,
      STORAGE_KEYS.statsCache,
    ]);
  },
};
