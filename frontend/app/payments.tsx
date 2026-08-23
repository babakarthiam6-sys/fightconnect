import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';

import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import ErrorView from '@/components/ErrorView';
import LoadingSpinner from '@/components/LoadingSpinner';
import OfflineBanner from '@/components/OfflineBanner';
import { COLORS, RADIUS, SHADOW, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useT } from '@/i18n';
import { useApp } from '@/context/AppContext';
import { paymentService } from '@/services/payment';
import { formatDateTime, formatPrice, formatStatus } from '@/utils/formatting';
import type { AppError, Payment, PaymentStatus } from '@/types';

const STATUS_TONES: Record<PaymentStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  succeeded: 'success',
  pending: 'warning',
  processing: 'warning',
  failed: 'danger',
  cancelled: 'neutral',
  refunded: 'neutral',
};

const STATUS_ICONS: Record<PaymentStatus, keyof typeof Ionicons.glyphMap> = {
  succeeded: 'checkmark-circle-outline',
  pending: 'time-outline',
  processing: 'sync-outline',
  failed: 'close-circle-outline',
  cancelled: 'ban-outline',
  refunded: 'return-down-back-outline',
};

function PaymentRow({ payment }: { payment: Payment }) {
  const t = useT();
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Ionicons name={STATUS_ICONS[payment.status]} size={20} color={COLORS.primary} />
      </View>

      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {payment.partnerName ?? t('paiement.seance')}
        </Text>
        <Text style={styles.rowDate}>{formatDateTime(payment.createdAt)}</Text>
        <Badge label={formatStatus(payment.status, t)} tone={STATUS_TONES[payment.status]} />
      </View>

      <Text style={styles.rowAmount}>{formatPrice(payment.amount, payment.currency)}</Text>
    </View>
  );
}

export default function PaymentsScreen() {
  const t = useT();
  const router = useRouter();
  const { isConnected } = useApp();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await paymentService.history();
      setPayments(result.items);
      setFromCache(result.fromCache);
      setError(null);
    } catch (caught) {
      setError(caught as AppError);
    }
  }, []);

  useEffect(() => {
    void load().finally(() => setIsLoading(false));
  }, [load]);

  // L'historique se met à jour après un paiement réalisé sur un autre écran.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }, [load]);

  const total = payments
    .filter((payment) => payment.status === 'succeeded')
    .reduce((sum, payment) => sum + payment.amount, 0);

  if (isLoading) return <LoadingSpinner fullScreen label={t('paiement.chargement')} />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <OfflineBanner visible={!isConnected || fromCache} />

      {payments.length > 0 ? (
        <View style={styles.summary}>
          <Text style={styles.summaryLabel}>Total dépensé</Text>
          <Text style={styles.summaryValue}>{formatPrice(total)}</Text>
        </View>
      ) : null}

      {error && payments.length === 0 ? (
        <ErrorView error={error} onRetry={() => void handleRefresh()} />
      ) : (
        <FlatList
          data={payments}
          keyExtractor={(item, index) => item.id || `payment-${index}`}
          renderItem={({ item }) => (
            <PaymentRow payment={item} />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="card-outline"
              title={t('paiement.aucun')}
              message={t('paiement.aucunTexte')}
              actionLabel={t('paiement.voirSparrings')}
              onAction={() => router.push('/(tabs)/search')}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: COLORS.background, flex: 1 },
  summary: {
    ...SHADOW,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    margin: SPACING.lg,
    marginBottom: SPACING.sm,
    padding: SPACING.lg,
  },
  summaryLabel: { ...TYPOGRAPHY.body, color: COLORS.textMuted },
  summaryValue: { ...TYPOGRAPHY.headline, color: COLORS.primary },
  list: { paddingBottom: SPACING.xxl, paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm },
  row: {
    ...SHADOW,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.md,
    padding: SPACING.lg,
  },
  rowPressed: { opacity: 0.9 },
  rowIcon: {
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { ...TYPOGRAPHY.body, color: COLORS.text, fontWeight: '600' },
  rowDate: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginBottom: SPACING.xs },
  rowAmount: { ...TYPOGRAPHY.subtitle, color: COLORS.text },
});
