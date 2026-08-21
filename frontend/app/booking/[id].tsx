import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useToast } from 'react-native-toast-notifications';

import Avatar from '@/components/Avatar';
import Button from '@/components/Button';
import DateTimeField from '@/components/DateTimeField';
import ErrorView from '@/components/ErrorView';
import LoadingSpinner from '@/components/LoadingSpinner';
import { CONFIG } from '@/constants/config';
import { COLORS, RADIUS, SHADOW, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { bookingService } from '@/services/booking';
import { partnerService } from '@/services/partner';
import { formatPrice, formatUserName } from '@/utils/formatting';
import { bookingSchema, validate, type FieldErrors, type BookingInput } from '@/utils/validation';
import type { AppError, Partner } from '@/types';

const MIN_ROUNDS = 1;
const MAX_ROUNDS = 20;

export default function BookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { invalidateBookings } = useApp();

  const [partner, setPartner] = useState<Partner | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);

  // Demain à 18 h : la plupart des séances se calent en soirée, et une date
  // déjà remplie évite un champ vide qui bloque la validation.
  const [scheduledAt, setScheduledAt] = useState(() => {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(18, 0, 0, 0);
    return start;
  });
  const [rounds, setRounds] = useState(2);
  const [errors, setErrors] = useState<FieldErrors<BookingInput>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      setPartner(await partnerService.detail(id));
    } catch (caught) {
      setError(caught as AppError);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const pricePerRound = partner?.pricePerRound ?? 0;

  // Le décompte affiché est celui que le serveur appliquera : la commission est
  // prélevée sur la part du partenaire, elle ne s'ajoute pas au total.
  const quote = useMemo(() => {
    const total = pricePerRound * rounds;
    return {
      total,
      commission: Math.round(total * CONFIG.commissionRate * 100) / 100,
    };
  }, [pricePerRound, rounds]);

  const submit = useCallback(async () => {
    const result = validate(bookingSchema, { scheduledAt: scheduledAt.toISOString(), rounds });
    setErrors(result.errors);
    if (!result.success || !result.data || !partner) return;

    setIsSubmitting(true);
    try {
      await bookingService.create({
        partnerId: partner.id,
        scheduledAt: result.data.scheduledAt,
        rounds: result.data.rounds,
      });
      invalidateBookings();
      toast.show('Demande envoyée', { type: 'success' });
      router.replace('/(tabs)/bookings?direction=sent');
    } catch (caught) {
      toast.show((caught as AppError).message, { type: 'danger' });
    } finally {
      setIsSubmitting(false);
    }
  }, [invalidateBookings, partner, rounds, router, scheduledAt, toast]);

  if (isLoading) return <LoadingSpinner fullScreen label="Chargement…" />;
  if (error) return <ErrorView error={error} onRetry={load} />;
  if (!partner) return null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.partnerCard}>
          <Avatar user={partner} size={56} />
          <View style={styles.identity}>
            <Text style={styles.name}>{formatUserName(partner)}</Text>
            <Text style={styles.meta}>{partner.city ?? 'Ville non précisée'}</Text>
          </View>
          <View style={styles.priceBlock}>
            <Text style={styles.price}>{formatPrice(pricePerRound, partner.currency)}</Text>
            <Text style={styles.meta}>/round</Text>
          </View>
        </View>

        <DateTimeField value={scheduledAt} onChange={setScheduledAt} error={errors.scheduledAt} />

        <Text style={styles.sectionTitle}>Nombre de rounds</Text>
        <View style={styles.stepper}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retirer un round"
            onPress={() => setRounds((value) => Math.max(MIN_ROUNDS, value - 1))}
            disabled={rounds <= MIN_ROUNDS}
            style={({ pressed }) => [
              styles.stepperButton,
              rounds <= MIN_ROUNDS && styles.stepperDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="remove" size={26} color={COLORS.textInverse} />
          </Pressable>

          <View style={styles.roundsBlock}>
            <Text style={styles.rounds}>{rounds}</Text>
            <Text style={styles.meta}>round{rounds > 1 ? 's' : ''}</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ajouter un round"
            onPress={() => setRounds((value) => Math.min(MAX_ROUNDS, value + 1))}
            disabled={rounds >= MAX_ROUNDS}
            style={({ pressed }) => [
              styles.stepperButton,
              rounds >= MAX_ROUNDS && styles.stepperDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="add" size={26} color={COLORS.textInverse} />
          </Pressable>
        </View>
        {errors.rounds ? <Text style={styles.error}>{errors.rounds}</Text> : null}

        <Text style={styles.sectionTitle}>Récapitulatif</Text>
        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.meta}>
              {rounds} round{rounds > 1 ? 's' : ''} × {formatPrice(pricePerRound, partner.currency)}
            </Text>
            <Text style={styles.summaryValue}>{formatPrice(quote.total, partner.currency)}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.meta}>
              Commission plateforme ({Math.round(CONFIG.commissionRate * 100)} %)
            </Text>
            <Text style={styles.summaryValue}>
              {formatPrice(quote.commission, partner.currency)}
            </Text>
          </View>

          <Text style={styles.note}>
            La commission est prélevée sur la part du partenaire. Vous payez le tarif annoncé,
            sans supplément.
          </Text>

          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total à payer</Text>
            <Text style={styles.total}>{formatPrice(quote.total, partner.currency)}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={`Envoyer la demande · ${formatPrice(quote.total, partner.currency)}`}
          onPress={submit}
          loading={isSubmitting}
          testID="booking-submit"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: COLORS.background, flex: 1 },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  partnerCard: {
    ...SHADOW,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    flexDirection: 'row',
    gap: SPACING.md,
    padding: SPACING.lg,
  },
  identity: { flex: 1, gap: 2 },
  name: { ...TYPOGRAPHY.subtitle, color: COLORS.text },
  meta: { ...TYPOGRAPHY.caption, color: COLORS.textMuted },
  priceBlock: { alignItems: 'flex-end' },
  price: { ...TYPOGRAPHY.subtitle, color: COLORS.primary },
  sectionTitle: { ...TYPOGRAPHY.title, color: COLORS.text, marginBottom: SPACING.md, marginTop: SPACING.xl },
  stepper: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.xl,
    justifyContent: 'center',
  },
  stepperButton: {
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  stepperDisabled: { backgroundColor: COLORS.disabled },
  pressed: { opacity: 0.85 },
  roundsBlock: { alignItems: 'center', minWidth: 72 },
  rounds: { ...TYPOGRAPHY.display, color: COLORS.text, fontSize: 44 },
  error: { ...TYPOGRAPHY.caption, color: COLORS.error, marginTop: SPACING.sm, textAlign: 'center' },
  summary: {
    ...SHADOW,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    gap: SPACING.sm,
    padding: SPACING.lg,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryValue: { ...TYPOGRAPHY.body, color: COLORS.text },
  note: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, lineHeight: 16 },
  totalRow: {
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    marginTop: SPACING.sm,
    paddingTop: SPACING.md,
  },
  totalLabel: { ...TYPOGRAPHY.subtitle, color: COLORS.text },
  total: { ...TYPOGRAPHY.title, color: COLORS.primary },
  footer: {
    backgroundColor: COLORS.background,
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    padding: SPACING.lg,
  },
});
