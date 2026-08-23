import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import Avatar from '@/components/Avatar';
import Badge from '@/components/Badge';
import Button from '@/components/Button';
import { COLORS, RADIUS, SHADOW, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useT } from '@/i18n';
import { formatDateTime, formatPrice, formatStatus, formatUserName } from '@/utils/formatting';
import type { Booking, BookingStatus } from '@/types';

type Tone = 'neutral' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger';

const STATUS_TONES: Record<BookingStatus, Tone> = {
  pending: 'warning',
  accepted: 'success',
  declined: 'danger',
  cancelled: 'neutral',
  completed: 'secondary',
};

interface Props {
  booking: Booking;
  /** « Reçues » montre le demandeur ; « Envoyées » montre le partenaire. */
  direction: 'received' | 'sent';
  busy?: boolean;
  onAccept?: (booking: Booking) => void;
  onDecline?: (booking: Booking) => void;
  onCancel?: (booking: Booking) => void;
  onPay?: (booking: Booking) => void;
}

export function BookingCard({
  booking,
  direction,
  busy = false,
  onAccept,
  onDecline,
  onCancel,
  onPay,
}: Props) {
  const t = useT();
  const other = direction === 'received' ? booking.requester : booking.partner;

  // Une demande à laquelle personne n'a encore répondu, ou déjà acceptée, peut
  // encore être annulée ; refusée, annulée ou terminée, il n'y a plus rien à faire.
  const isLive = booking.status === 'pending' || booking.status === 'accepted';
  const canRespond = direction === 'received' && booking.status === 'pending';
  const canPay = direction === 'sent' && booking.status === 'accepted' && !booking.paid && booking.total > 0;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Avatar user={other} size={44} />
        <View style={styles.identity}>
          <Text style={styles.name} numberOfLines={1}>
            {formatUserName(other)}
          </Text>
          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={13} color={COLORS.textMuted} />
            <Text style={styles.meta} numberOfLines={1}>
              {formatDateTime(booking.scheduledAt)}
            </Text>
          </View>
        </View>
        <Badge label={formatStatus(booking.status, t)} tone={STATUS_TONES[booking.status]} />
      </View>

      <View style={styles.summary}>
        <Text style={styles.meta}>
          {booking.rounds} {t(booking.rounds > 1 ? 'reservation.rounds' : 'reservation.round')} ×{' '}
          {formatPrice(booking.pricePerRound, booking.currency)}
        </Text>
        <Text style={styles.total}>{formatPrice(booking.total, booking.currency)}</Text>
      </View>

      {booking.paid ? (
        <View style={styles.metaRow}>
          <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
          <Text style={styles.paid}>{t('demandes.payee')}</Text>
        </View>
      ) : null}

      {canRespond || canPay || isLive ? (
        <View style={styles.actions}>
          {canRespond ? (
            <>
              <Button
                label={t('demandes.accepter')}
                onPress={() => onAccept?.(booking)}
                loading={busy}
                fullWidth={false}
                style={styles.action}
              />
              <Button
                label={t('demandes.refuser')}
                variant="outline"
                onPress={() => onDecline?.(booking)}
                disabled={busy}
                fullWidth={false}
                style={styles.action}
              />
            </>
          ) : null}

          {canPay ? (
            <Button
              label="Payer"
              onPress={() => onPay?.(booking)}
              disabled={busy}
              fullWidth={false}
              style={styles.action}
            />
          ) : null}

          {isLive && !canRespond ? (
            <Button
              label="Annuler"
              variant="ghost"
              onPress={() => onCancel?.(booking)}
              disabled={busy}
              fullWidth={false}
              style={styles.action}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...SHADOW,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    gap: SPACING.sm,
    marginBottom: SPACING.md,
    padding: SPACING.lg,
  },
  headerRow: { alignItems: 'center', flexDirection: 'row', gap: SPACING.md },
  identity: { flex: 1, gap: 2 },
  name: { ...TYPOGRAPHY.subtitle, color: COLORS.text },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: SPACING.xs },
  meta: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, flexShrink: 1 },
  paid: { ...TYPOGRAPHY.caption, color: COLORS.success },
  summary: {
    alignItems: 'center',
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: SPACING.sm,
  },
  total: { ...TYPOGRAPHY.subtitle, color: COLORS.primary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  action: { flexGrow: 1, minHeight: 44 },
});

export default BookingCard;
