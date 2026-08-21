import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import Avatar from '@/components/Avatar';
import Button from '@/components/Button';
import ErrorView from '@/components/ErrorView';
import LoadingSpinner from '@/components/LoadingSpinner';
import RatingStars from '@/components/RatingStars';
import { COLORS, RADIUS, SHADOW, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { partnerService } from '@/services/partner';
import {
  formatLevel,
  formatPrice,
  formatStyle,
  formatUserName,
  formatWeightClass,
} from '@/utils/formatting';
import type { AppError, Partner } from '@/types';

export default function PartnerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [partner, setPartner] = useState<Partner | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);

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

  if (isLoading) return <LoadingSpinner fullScreen label="Chargement du profil…" />;
  if (error) return <ErrorView error={error} onRetry={load} />;
  if (!partner) return null;

  const isNew = partner.ratingsCount === 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Avatar user={partner} size={128} />
          <Text style={styles.name}>{formatUserName(partner)}</Text>

          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={15} color={COLORS.textMuted} />
            <Text style={styles.meta}>{partner.city ?? 'Ville non précisée'}</Text>
          </View>

          <View style={styles.ratingRow}>
            <RatingStars value={partner.averageRating ?? 0} size={16} />
            <Text style={styles.ratingLabel}>
              {isNew ? 'Nouveau' : partner.averageRating?.toFixed(1)}
            </Text>
            <Text style={styles.meta}>
              ({partner.ratingsCount} avis)
            </Text>
          </View>

          <View style={styles.priceTag}>
            <Text style={styles.price}>{formatPrice(partner.pricePerRound, partner.currency)}</Text>
            <Text style={styles.perRound}> par round</Text>
          </View>
        </View>

        <View style={styles.tiles}>
          <Tile icon="pulse" value={formatStyle(partner.style)} label="Sport" />
          <Tile icon="trophy" value={formatLevel(partner.level)} label="Niveau" />
          <Tile
            icon="barbell"
            value={partner.weightClass ? formatWeightClass(partner.weightClass) : '—'}
            label="Poids"
          />
        </View>

        <Text style={styles.sectionTitle}>Statistiques</Text>
        <View style={styles.tiles}>
          <Stat value={String(partner.fightsCount)} label="Combats" />
          <Stat value={String(partner.experienceYears)} label="Années d’exp." />
          <Stat value={partner.heightCm ? String(partner.heightCm) : '—'} label="Taille (cm)" />
        </View>

        <Text style={styles.sectionTitle}>À propos</Text>
        <View style={styles.card}>
          <Text style={partner.bio ? styles.bio : styles.bioEmpty}>
            {partner.bio ?? 'Ce partenaire n’a pas encore écrit de présentation.'}
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Réserver"
          onPress={() => router.push(`/booking/${partner.id}`)}
          disabled={!partner.available}
          icon={<Ionicons name="calendar" size={18} color={COLORS.textInverse} />}
          testID="partner-book"
        />
        {!partner.available ? (
          <Text style={styles.unavailable}>
            Ce partenaire s’est mis en pause. Il n’accepte pas de demande pour l’instant.
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function Tile({
  icon,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.tile}>
      <Ionicons name={icon} size={22} color={COLORS.primary} />
      <Text style={styles.tileValue} numberOfLines={2}>
        {value}
      </Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: COLORS.background, flex: 1 },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  header: { alignItems: 'center', gap: SPACING.xs },
  name: { ...TYPOGRAPHY.display, color: COLORS.text, marginTop: SPACING.md },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: SPACING.xs },
  meta: { ...TYPOGRAPHY.body, color: COLORS.textMuted },
  ratingRow: { alignItems: 'center', flexDirection: 'row', gap: SPACING.sm },
  ratingLabel: { ...TYPOGRAPHY.subtitle, color: COLORS.text },
  priceTag: {
    alignItems: 'baseline',
    backgroundColor: COLORS.primarySoft,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  price: { ...TYPOGRAPHY.display, color: COLORS.primary },
  perRound: { ...TYPOGRAPHY.body, color: COLORS.primary },
  tiles: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  tile: {
    ...SHADOW,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    flex: 1,
    gap: 2,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.lg,
  },
  // « Professionnel » ne tient pas sur une ligne dans un tiers d'écran :
  // la police est réduite ici plutôt que le libellé abrégé, qui perdrait en clarté.
  tileValue: { ...TYPOGRAPHY.body, color: COLORS.text, fontWeight: '700', textAlign: 'center' },
  tileLabel: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, textAlign: 'center' },
  statValue: { ...TYPOGRAPHY.display, color: COLORS.primary },
  sectionTitle: { ...TYPOGRAPHY.title, color: COLORS.text, marginTop: SPACING.xl },
  card: {
    ...SHADOW,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    marginTop: SPACING.md,
    padding: SPACING.lg,
  },
  bio: { ...TYPOGRAPHY.body, color: COLORS.text, fontSize: 15, lineHeight: 22 },
  bioEmpty: { ...TYPOGRAPHY.body, color: COLORS.textMuted, fontStyle: 'italic' },
  footer: {
    backgroundColor: COLORS.background,
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    gap: SPACING.sm,
    padding: SPACING.lg,
  },
  unavailable: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, textAlign: 'center' },
});
