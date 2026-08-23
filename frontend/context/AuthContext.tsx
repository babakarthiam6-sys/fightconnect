import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { setUnauthorizedHandler } from '@/services/api';
import { authService } from '@/services/auth';
import type { AppError, User } from '@/types';
import type { LoginInput, ProfileInput, SignupInput } from '@/utils/validation';

interface AuthState {
  user: User | null;
  token: string | null;
  /** `true` tant que la restauration de session au démarrage n'a pas abouti. */
  isBootstrapping: boolean;
  isSubmitting: boolean;
  error: AppError | null;
}

interface AuthContextValue extends AuthState {
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<boolean>;
  signup: (input: SignupInput) => Promise<boolean>;
  logout: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  updateProfile: (changes: ProfileInput) => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isBootstrapping: true,
    isSubmitting: false,
    error: null,
  });

  // Évite un setState après démontage si la restauration traîne.
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    if (!isMounted.current) return;
    setState({
      user: null,
      token: null,
      isBootstrapping: false,
      isSubmitting: false,
      error: null,
    });
  }, []);

  const deleteAccount = useCallback(async (password: string) => {
    // Le service ne vide l'appareil qu'après un serveur qui a dit oui : un refus
    // — mot de passe faux, séance payée à venir — doit laisser la session
    // intacte, sans quoi on serait déconnecté d'un compte qui existe toujours.
    await authService.deleteAccount(password);
    if (!isMounted.current) return;
    setState({
      user: null,
      token: null,
      isBootstrapping: false,
      isSubmitting: false,
      error: null,
    });
  }, []);

  // Auto-login : on tente de rejouer le token stocké au lancement de l'app.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const session = await authService.restore();
      if (cancelled || !isMounted.current) return;
      setState((previous) => ({
        ...previous,
        user: session?.user ?? null,
        token: session?.token ?? null,
        isBootstrapping: false,
      }));
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Un 401 renvoyé par n'importe quelle requête déconnecte l'utilisateur.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void logout();
    });
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const runAuth = useCallback(
    async (action: () => Promise<{ token: string; user: User }>): Promise<boolean> => {
      setState((previous) => ({ ...previous, isSubmitting: true, error: null }));
      try {
        const session = await action();
        if (!isMounted.current) return true;
        setState({
          user: session.user,
          token: session.token,
          isBootstrapping: false,
          isSubmitting: false,
          error: null,
        });
        return true;
      } catch (error) {
        if (!isMounted.current) return false;
        setState((previous) => ({
          ...previous,
          isSubmitting: false,
          error: error as AppError,
        }));
        return false;
      }
    },
    [],
  );

  const login = useCallback(
    (input: LoginInput) => runAuth(() => authService.login(input)),
    [runAuth],
  );

  const signup = useCallback(
    (input: SignupInput) => runAuth(() => authService.signup(input)),
    [runAuth],
  );

  const refreshUser = useCallback(async () => {
    if (!state.token) return;
    try {
      const user = await authService.me();
      if (!isMounted.current) return;
      setState((previous) => ({ ...previous, user }));
    } catch {
      // Rafraîchissement silencieux : on garde le profil déjà affiché.
    }
  }, [state.token]);

  /**
   * Enregistre une modification du profil sportif.
   *
   * Le profil renvoyé par le serveur remplace celui en mémoire : c'est lui qui
   * fait foi, et il porte les valeurs normalisées (une ville mise en forme, un
   * champ vidé devenu `null`).
   */
  const updateProfile = useCallback(async (changes: ProfileInput) => {
    const user = await authService.updateProfile(changes);
    if (!isMounted.current) return;
    setState((previous) => ({ ...previous, user }));
  }, []);

  const clearError = useCallback(() => {
    setState((previous) => ({ ...previous, error: null }));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      isAuthenticated: state.token !== null && state.user !== null,
      login,
      signup,
      logout,
      deleteAccount,
      refreshUser,
      updateProfile,
      clearError,
    }),
    [state, login, signup, logout, deleteAccount, refreshUser, updateProfile, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé à l’intérieur de <AuthProvider>.');
  }
  return context;
}
