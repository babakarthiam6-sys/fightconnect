import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';

import Button from '@/components/Button';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { IS_STRIPE_CONFIGURED } from '@/constants/config';
import { paymentService } from '@/services/payment';
import { formatPrice } from '@/utils/formatting';
import type { AppError, Booking } from '@/types';

interface Props {
  booking: Booking;
  /** Appelé après un paiement confirmé par Stripe. */
  onSuccess: () => void;
  onError?: (error: AppError) => void;
  disabled?: boolean;
  label?: string;
}

/**
 * Paiement via la Payment Sheet Stripe.
 *
 * Le flux est : PaymentIntent créé par le backend -> feuille Stripe native ->
 * confirmation. Aucune donnée de carte ne transite par ce composant.
 */
export function PaymentForm({ booking, onSuccess, onError, disabled = false, label }: Props) {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fail = useCallback(
    (error: AppError) => {
      setMessage(error.message);
      onError?.(error);
    },
    [onError],
  );

  const handlePay = useCallback(async () => {
    if (!IS_STRIPE_CONFIGURED) {
      fail({
        message: 'Paiement indisponible : clé publique Stripe non configurée.',
        status: null,
        isNetworkError: false,
        fieldErrors: null,
      });
      return;
    }

    setIsProcessing(true);
    setMessage(null);

    try {
      const intent = await paymentService.createIntent(booking.id);

      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'FightConnect',
        paymentIntentClientSecret: intent.clientSecret,
        customerId: intent.customerId ?? undefined,
        customerEphemeralKeySecret: intent.ephemeralKey ?? undefined,
        applePay: { merchantCountryCode: 'FR' },
        googlePay: { merchantCountryCode: 'FR', testEnv: true },
        style: 'automatic',
        returnURL: 'fightconnect://stripe-redirect',
        defaultBillingDetails: { address: { country: 'FR' } },
      });

      if (initError) {
        fail({
          message: initError.message,
          status: null,
          isNetworkError: false,
          fieldErrors: null,
        });
        return;
      }

      const { error: sheetError } = await presentPaymentSheet();

      if (sheetError) {
        // `Canceled` = l'utilisateur a fermé la feuille : ce n'est pas une erreur.
        if (sheetError.code === 'Canceled') {
          setMessage(null);
          return;
        }
        fail({
          message: sheetError.message,
          status: null,
          isNetworkError: false,
          fieldErrors: null,
        });
        return;
      }

      onSuccess();
    } catch (error) {
      fail(error as AppError);
    } finally {
      setIsProcessing(false);
    }
  }, [booking.id, fail, initPaymentSheet, onSuccess, presentPaymentSheet]);

  return (
    <View style={styles.container}>
      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>Montant à régler</Text>
        <Text style={styles.summaryValue}>{formatPrice(booking.total, booking.currency)}</Text>
      </View>

      <Button
        label={label ?? 'Payer et rejoindre'}
        onPress={handlePay}
        loading={isProcessing}
        disabled={disabled}
        icon={<Ionicons name="lock-closed-outline" size={16} color={COLORS.textInverse} />}
      />

      {message ? <Text style={styles.error}>{message}</Text> : null}

      <View style={styles.secureRow}>
        <Ionicons name="shield-checkmark-outline" size={14} color={COLORS.textMuted} />
        <Text style={styles.secureText}>Paiement sécurisé par Stripe</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: SPACING.md },
  summary: {
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  summaryLabel: { ...TYPOGRAPHY.body, color: COLORS.textMuted },
  summaryValue: { ...TYPOGRAPHY.title, color: COLORS.text },
  error: { ...TYPOGRAPHY.caption, color: COLORS.error, textAlign: 'center' },
  secureRow: { alignItems: 'center', flexDirection: 'row', gap: SPACING.xs, justifyContent: 'center' },
  secureText: { ...TYPOGRAPHY.caption, color: COLORS.textMuted },
});

export default PaymentForm;
