import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useToast } from 'react-native-toast-notifications';

import Avatar from '@/components/Avatar';
import Badge from '@/components/Badge';
import Button from '@/components/Button';
import ErrorView from '@/components/ErrorView';
import LoadingSpinner from '@/components/LoadingSpinner';
import PaymentForm from '@/components/PaymentForm';
import RatingStars from '@/components/RatingStars';
import ReviewCard from '@/components/ReviewCard';
import ReviewForm from '@/components/ReviewForm';
import { COLORS, RADIUS, SHADOW, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { moderationService } from '@/services/moderation';
import { sparringService } from '@/services/sparring';
import {
  formatDateTime,
  formatDuration,
  formatLevel,
  formatPrice,
  formatRating,
  formatStatus,
  formatStyle,
  formatUserName,
} from '@/utils/formatting';
import type { AppError, Review, Sparring } from '@/types';

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={COLORS.secondary} />
      <View style={styles.infoText}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

export default function SparringDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { invalidateSparrings, refreshStats } = useApp();

  const [sparring, setSparring] = useState<Sparring | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const detail = await sparringService.detail(id);
      setSparring(detail);
      setError(null);
      // Les avis sont secondaires : leur échec ne doit pas masquer la fiche.
      setReviews(await moderationService.listReviews(id).catch(() => []));
    } catch (caught) {
      setError(caught as AppError);
    }
  }, [id]);

  useEffect(() => {
    void load().finally(() => setIsLoading(false));
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }, [load]);

  const isCreator = Boolean(user && sparring?.creator?.id === user.id);
  const isParticipant = useMemo(
    () => Boolean(user && sparring?.participants.some((participant) => participant.id === user.id)),
    [sparring, user],
  );

  const seatsLeft = sparring
    ? Math.max(0, sparring.maxParticipants - sparring.participants.length)
    : 0;
  const isFull = seatsLeft === 0 || sparring?.status === 'full';
  const isClosed = sparring?.status === 'completed' || sparring?.status === 'cancelled';
  const isFree = (sparring?.price ?? 0) <= 0;

  const join = useCallback(async () => {
    if (!sparring) return;
    setIsJoining(true);
    try {
      await sparringService.join(sparring.id);
      toast.show('Participation confirmée !', { type: 'success' });
      invalidateSparrings();
      await Promise.all([load(), refreshStats()]);
    } catch (caught) {
      toast.show((caught as AppError).message, { type: 'danger' });
    } finally {
      setIsJoining(false);
    }
  }, [invalidateSparrings, load, refreshStats, sparring, toast]);

  const cancelParticipation = useCallback(() => {
    if (!sparring) return;
    Alert.alert('Annuler la participation', 'Confirmez-vous l’annulation de votre place ?', [
      { text: 'Retour', style: 'cancel' },
      {
        text: 'Annuler ma place',
        style: 'destructive',
        onPress: async () => {
          setIsJoining(true);
          try {
            await sparringService.cancel(sparring.id);
            toast.show('Participation annulée.', { type: 'normal' });
            invalidateSparrings();
            await load();
          } catch (caught) {
            toast.show((caught as AppError).message, { type: 'danger' });
          } finally {
            setIsJoining(false);
          }
        },
      },
    ]);
  }, [invalidateSparrings, load, sparring, toast]);

  const handleReviewSubmitted = useCallback(
    (review: Review) => {
      setReviews((previous) => [review, ...previous]);
      toast.show(
        review.flagged
          ? 'Avis publié, mais signalé par la modération.'
          : 'Merci pour votre avis !',
        { type: review.flagged ? 'warning' : 'success' },
      );
    },
    [toast],
  );

  if (isLoading) return <LoadingSpinner fullScreen label="Chargement du sparring…" />;
  if (error && !sparring) return <ErrorView error={error} onRetry={() => void handleRefresh()} />;
  if (!sparring) return <ErrorView error={{ message: 'Sparring introuvable.', status: 404, isNetworkError: false, fieldErrors: null }} />;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
      }
    >
      <View style={styles.card}>
        <Text style={styles.title}>{sparring.title}</Text>

        <View style={styles.badges}>
          <Badge label={formatStyle(sparring.style)} tone="primary" icon="flame-outline" />
          <Badge label={formatLevel(sparring.level)} tone="secondary" />
          <Badge
            label={formatStatus(sparring.status)}
            tone={isClosed ? 'neutral' : isFull ? 'danger' : 'success'}
          />
        </View>

        <Text style={styles.price}>{formatPrice(sparring.price, sparring.currency)}</Text>
        {sparring.description ? <Text style={styles.description}>{sparring.description}</Text> : null}
      </View>

      <View style={styles.card}>
        <InfoRow icon="calendar-outline" label="Date" value={formatDateTime(sparring.scheduledAt)} />
        <InfoRow icon="time-outline" label="Durée" value={formatDuration(sparring.durationMinutes)} />
        <InfoRow icon="location-outline" label="Lieu" value={sparring.location || 'À confirmer'} />
        <InfoRow
          icon="people-outline"
          label="Participants"
          value={`${sparring.participants.length}/${sparring.maxParticipants} — ${
            isFull ? 'complet' : `${seatsLeft} place(s) restante(s)`
          }`}
        />
      </View>

      {sparring.creator ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Organisateur</Text>
          <View style={styles.creatorRow}>
            <Avatar user={sparring.creator} size={48} />
            <View style={styles.creatorInfo}>
              <Text style={styles.creatorName}>{formatUserName(sparring.creator)}</Text>
              <View style={styles.creatorRating}>
                <RatingStars value={sparring.creator.averageRating ?? 0} size={14} />
                <Text style={styles.creatorRatingText}>
                  {formatRating(sparring.creator.averageRating)}
                </Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      {sparring.participants.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Participants</Text>
          <View style={styles.participants}>
            {sparring.participants.map((participant) => (
              <View key={participant.id} style={styles.participant}>
                <Avatar user={participant} size={40} />
                <Text style={styles.participantName} numberOfLines={1}>
                  {participant.firstName || 'Participant'}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.card}>
        {isCreator ? (
          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={18} color={COLORS.secondary} />
            <Text style={styles.noticeText}>Vous êtes l’organisateur de ce sparring.</Text>
          </View>
        ) : isParticipant ? (
          <Button
            label="Annuler ma participation"
            onPress={cancelParticipation}
            variant="outline"
            loading={isJoining}
          />
        ) : isClosed ? (
          <View style={styles.notice}>
            <Ionicons name="lock-closed-outline" size={18} color={COLORS.textMuted} />
            <Text style={styles.noticeText}>Ce sparring n’accepte plus d’inscription.</Text>
          </View>
        ) : isFull ? (
          <View style={styles.notice}>
            <Ionicons name="people-outline" size={18} color={COLORS.error} />
            <Text style={styles.noticeText}>Toutes les places sont prises.</Text>
          </View>
        ) : isFree ? (
          <Button label="Rejoindre gratuitement" onPress={join} loading={isJoining} />
        ) : (
          <PaymentForm
            sparring={sparring}
            onSuccess={join}
            onError={(paymentError) => toast.show(paymentError.message, { type: 'danger' })}
          />
        )}
      </View>

      <Text style={styles.reviewsTitle}>Avis ({reviews.length})</Text>

      {reviews.length === 0 ? (
        <Text style={styles.noReviews}>Aucun avis pour l’instant.</Text>
      ) : (
        reviews.map((review) => <ReviewCard key={review.id} review={review} />)
      )}

      {isParticipant || isCreator ? (
        <ReviewForm
          sparringId={sparring.id}
          onSubmitted={handleReviewSubmitted}
          onError={(reviewError) => toast.show(reviewError.message, { type: 'danger' })}
        />
      ) : null}

      <Button
        label="Retour aux sparrings"
        onPress={() => router.push('/(tabs)/sparrings')}
        variant="ghost"
        style={styles.back}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: COLORS.background, flex: 1 },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  card: {
    ...SHADOW,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    padding: SPACING.lg,
  },
  title: { ...TYPOGRAPHY.headline, color: COLORS.text },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.md },
  price: { ...TYPOGRAPHY.headline, color: COLORS.primary, marginTop: SPACING.md },
  description: { ...TYPOGRAPHY.body, color: COLORS.text, lineHeight: 21, marginTop: SPACING.md },
  infoRow: { alignItems: 'center', flexDirection: 'row', gap: SPACING.md, paddingVertical: SPACING.sm },
  infoText: { flex: 1 },
  infoLabel: { ...TYPOGRAPHY.caption, color: COLORS.textMuted },
  infoValue: { ...TYPOGRAPHY.body, color: COLORS.text },
  sectionTitle: { ...TYPOGRAPHY.subtitle, color: COLORS.text, marginBottom: SPACING.md },
  creatorRow: { alignItems: 'center', flexDirection: 'row', gap: SPACING.md },
  creatorInfo: { flex: 1 },
  creatorName: { ...TYPOGRAPHY.body, color: COLORS.text, fontWeight: '600' },
  creatorRating: { alignItems: 'center', flexDirection: 'row', gap: SPACING.sm, marginTop: 2 },
  creatorRatingText: { ...TYPOGRAPHY.caption, color: COLORS.textMuted },
  participants: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.lg },
  participant: { alignItems: 'center', gap: SPACING.xs, width: 64 },
  participantName: { ...TYPOGRAPHY.caption, color: COLORS.textMuted },
  notice: { alignItems: 'center', flexDirection: 'row', gap: SPACING.sm },
  noticeText: { ...TYPOGRAPHY.body, color: COLORS.textMuted, flex: 1 },
  reviewsTitle: { ...TYPOGRAPHY.title, color: COLORS.text, marginBottom: SPACING.md, marginTop: SPACING.lg },
  noReviews: { ...TYPOGRAPHY.body, color: COLORS.textMuted, marginBottom: SPACING.lg },
  back: { marginTop: SPACING.lg },
});
