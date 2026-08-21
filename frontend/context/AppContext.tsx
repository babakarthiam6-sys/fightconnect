import NetInfo from '@react-native-community/netinfo';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { revenueService } from '@/services/revenue';
import { useAuth } from '@/context/AuthContext';
import type { RevenueStats } from '@/types';

interface AppContextValue {
  /** `false` dès que NetInfo signale la perte de connexion. */
  isConnected: boolean;
  stats: RevenueStats | null;
  isLoadingStats: boolean;
  statsFromCache: boolean;
  refreshStats: () => Promise<void>;
  /** Incrémenté après une demande envoyée ou traitée : les listes s'y abonnent. */
  bookingsVersion: number;
  invalidateBookings: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [isConnected, setIsConnected] = useState(true);
  const [stats, setStats] = useState<RevenueStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [statsFromCache, setStatsFromCache] = useState(false);
  const [bookingsVersion, setBookingsVersion] = useState(0);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected === true && state.isInternetReachable !== false);
    });
    return unsubscribe;
  }, []);

  const refreshStats = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoadingStats(true);
    const result = await revenueService.stats();
    setStats(result.stats);
    setStatsFromCache(result.fromCache);
    setIsLoadingStats(false);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setStats(null);
      return;
    }
    void refreshStats();
  }, [isAuthenticated, refreshStats]);

  const invalidateBookings = useCallback(() => {
    setBookingsVersion((version) => version + 1);
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      isConnected,
      stats,
      isLoadingStats,
      statsFromCache,
      refreshStats,
      bookingsVersion,
      invalidateBookings,
    }),
    [isConnected, stats, isLoadingStats, statsFromCache, refreshStats, bookingsVersion, invalidateBookings],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp doit être utilisé à l’intérieur de <AppProvider>.');
  }
  return context;
}
