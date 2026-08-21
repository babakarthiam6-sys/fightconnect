import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useToast } from 'react-native-toast-notifications';

import Avatar from '@/components/Avatar';
import ErrorView from '@/components/ErrorView';
import LoadingSpinner from '@/components/LoadingSpinner';
import PaymentForm from '@/components/PaymentForm';
import { COLORS, RADIUS, SHADOW, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { bookingService } from '@/services/booking';
import { formatDateTime, formatPrice, formatUserName } from '@/utils/formatting';
import type { AppError, Booking } from '@/types';

export default function PayBookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { invalidateBookings } = useApp();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);

  /**
   * La demande est relue depuis la liste plutôt que par un appel dédié.
   *
   * Il n'existe pas d'endpoint « une demande » : la liste des demandes envoyées
   * contient déjà tout ce qu'il faut, et évite d'ajouter une route au serveur
   * pour un seul écran.
   */
  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const sent = await bookingService.list('sent');
      setBooking(sent.find((item) => item.id === id) ?? null);
    } catch (caught) {
      setError(caught as AppError);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSuccess = useCallback(() => {
    toast.show('Paiement accepté', { type: 'success' });
    invalidateBookings();
    router.replace('/(tabs)/bookings?direction=sent');
  }, [invalidateBookings, router, toast]);

  if (isLoading) return <LoadingSpinner fullScreen label="Chargement…" />;
  if (error) return <ErrorView error={error} onRetry={load} />;
  if (!booking) {
    return (
      <ErrorView
        error={{
          message: 'Cette demande n’existe plus.',
          status: 404,
          isNetworkError: false,
          fieldErrors: null,
        }}
        onRetry={load}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Avatar user={booking.partner} size={52} />
            <View style={styles.identity}>
              <Text style={styles.name}>{formatUserName(booking.partner)}</Text>
              <Text style={styles.meta}>{formatDateTime(booking.scheduledAt)}</Text>
            </View>
          </View>

          <View style={styles.row}>
            <Text style={styles.meta}>
              {booking.rounds} round{booking.rounds > 1 ? 's' : ''} ×{' '}
              {formatPrice(booking.pricePerRound, booking.currency)}
            </Text>
            <Text style={styles.total}>{formatPrice(booking.total, booking.currency)}</Text>
          </View>
        </View>

        <PaymentForm
          booking={booking}
          onSuccess={onSuccess}
          onError={(caught) => toast.show(caught.message, { type: 'danger' })}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: COLORS.background, flex: 1 },
  content: { gap: SPACING.lg, padding: SPACING.lg },
  card: {
    ...SHADOW,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    gap: SPACING.md,
    padding: SPACING.lg,
  },
  headerRow: { alignItems: 'center', flexDirection: 'row', gap: SPACING.md },
  identity: { flex: 1, gap: 2 },
  name: { ...TYPOGRAPHY.subtitle, color: COLORS.text },
  meta: { ...TYPOGRAPHY.caption, color: COLORS.textMuted },
  row: {
    alignItems: 'center',
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: SPACING.md,
  },
  total: { ...TYPOGRAPHY.title, color: COLORS.primary },
});
