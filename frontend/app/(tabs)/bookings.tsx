import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useToast } from 'react-native-toast-notifications';

import BookingCard from '@/components/BookingCard';
import EmptyState from '@/components/EmptyState';
import ErrorView from '@/components/ErrorView';
import LoadingSpinner from '@/components/LoadingSpinner';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useT } from '@/i18n';
import { useApp } from '@/context/AppContext';
import { bookingService, type Direction } from '@/services/booking';
import type { AppError, Booking } from '@/types';

const TABS = [
  { id: 'received', cle: 'demandes.recues' },
  { id: 'sent', cle: 'demandes.envoyees' },
] as const;

export default function BookingsScreen() {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const { bookingsVersion, invalidateBookings, refreshStats } = useApp();

  // Venir d'envoyer une demande et atterrir sur « Reçues », vide, donne
  // l'impression que l'envoi a échoué : l'écran d'origine dit quel volet ouvrir.
  const { direction: requested } = useLocalSearchParams<{ direction?: string }>();
  const [direction, setDirection] = useState<Direction>(
    requested === 'sent' ? 'sent' : 'received',
  );
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setBookings(await bookingService.list(direction));
    } catch (caught) {
      setError(caught as AppError);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [direction]);

  useEffect(() => {
    setIsLoading(true);
    void load();
  }, [load, bookingsVersion]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /**
   * Applique une action puis recharge.
   *
   * L'état renvoyé par le serveur fait foi : mettre à jour la liste localement
   * risquerait d'afficher « acceptée » alors que l'autre partie vient d'annuler.
   */
  const act = useCallback(
    async (booking: Booking, action: (id: string) => Promise<Booking>, message: string) => {
      setBusyId(booking.id);
      try {
        await action(booking.id);
        toast.show(message, { type: 'success' });
        invalidateBookings();
        await Promise.all([load(), refreshStats()]);
      } catch (caught) {
        toast.show((caught as AppError).message, { type: 'danger' });
      } finally {
        setBusyId(null);
      }
    },
    [invalidateBookings, load, refreshStats, toast],
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('demandes.titre')}</Text>
      </View>

      <View style={styles.tabs}>
        {TABS.map((tab) => {
          const isActive = direction === tab.id;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              onPress={() => setDirection(tab.id)}
              style={[styles.tab, isActive && styles.tabActive]}
            >
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{t(tab.cle)}</Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <LoadingSpinner fullScreen label={t('demandes.chargement')} />
      ) : error ? (
        <ErrorView error={error} onRetry={load} />
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <BookingCard
              booking={item}
              direction={direction}
              busy={busyId === item.id}
              onAccept={(booking) => act(booking, bookingService.accept, t('demandes.acceptee'))}
              onDecline={(booking) => act(booking, bookingService.decline, t('demandes.refusee'))}
              onCancel={(booking) => act(booking, bookingService.cancel, t('demandes.annulee'))}
              onPay={(booking) => router.push(`/booking/pay/${booking.id}`)}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                setIsRefreshing(true);
                void load();
              }}
              tintColor={COLORS.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="calendar-outline"
              title={t('demandes.aucune')}
              message={
                direction === 'sent'
                  ? t('demandes.aucuneEnvoyee')
                  : t('demandes.aucuneRecue')
              }
              actionLabel={direction === 'sent' ? t('demandes.trouverPartenaire') : undefined}
              onAction={
                direction === 'sent' ? () => router.push('/(tabs)/search') : undefined
              }
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: COLORS.background, flex: 1 },
  header: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },
  title: { ...TYPOGRAPHY.display, color: COLORS.text },
  tabs: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    flexDirection: 'row',
    margin: SPACING.lg,
    padding: 4,
  },
  tab: {
    alignItems: 'center',
    borderRadius: RADIUS.md,
    flex: 1,
    paddingVertical: SPACING.md,
  },
  tabActive: { backgroundColor: COLORS.primary },
  tabLabel: { ...TYPOGRAPHY.subtitle, color: COLORS.textMuted },
  tabLabelActive: { color: COLORS.textInverse },
  list: { paddingBottom: SPACING.xxl, paddingHorizontal: SPACING.lg },
});
