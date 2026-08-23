import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import Avatar from '@/components/Avatar';
import Button from '@/components/Button';
import ErrorView from '@/components/ErrorView';
import LoadingSpinner from '@/components/LoadingSpinner';
import RatingStars from '@/components/RatingStars';
import SecuriteSheet from '@/components/SecuriteSheet';
import { COLORS, RADIUS, SHADOW, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useT } from '@/i18n';
import { partnerService } from '@/services/partner';
import {
  formatLevel,
  formatPrice,
  formatRating,
  formatStyle,
  formatUserName,
  formatWeightClass,
} from '@/utils/formatting';
import type { AppError, Partner } from '@/types';

export default function PartnerScreen() {
  const t = useT();
  const [securiteOuverte, setSecuriteOuverte] = useState(false);
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

  if (isLoading) return <LoadingSpinner fullScreen label={t('partenaire.chargement')} />;
  if (error) return <ErrorView error={error} onRetry={load} />;
  if (!partner) return null;

  const isNew = partner.ratingsCount === 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/*
          Le signalement doit être atteignable depuis le contenu lui-même, et
          non enfoui dans un menu de réglages : c'est ce que demandent les deux
          magasins, et c'est aussi le seul endroit où quelqu'un y pense.
        */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('securite.signalerCette', { nom: formatUserName(partner) })}
          onPress={() => setSecuriteOuverte(true)}
          style={styles.signaler}
          hitSlop={10}
          testID="partner-report"
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.textMuted} />
        </Pressable>

        <View style={styles.header}>
          <Avatar user={partner} size={128} />
          <Text style={styles.name}>{formatUserName(partner)}</Text>

          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={15} color={COLORS.textMuted} />
            <Text style={styles.meta}>{partner.city ?? t('partenaire.villeInconnue')}</Text>
          </View>

          <View style={styles.ratingRow}>
            <RatingStars
              value={partner.averageRating ?? 0}
              size={16}
              ratingsCount={partner.ratingsCount}
            />
            <Text style={styles.ratingLabel}>
              {isNew ? t('partenaire.nouveau') : formatRating(partner.averageRating)}
            </Text>
            <Text style={styles.meta}>
              {t('partenaire.avis', { n: partner.ratingsCount })}
            </Text>
          </View>

          <View style={styles.priceTag}>
            <Text style={styles.price}>{formatPrice(partner.pricePerRound, partner.currency)}</Text>
            <Text style={styles.perRound}>{t('partenaire.parRound')}</Text>
          </View>
        </View>

        <View style={styles.tiles}>
          <Tile icon="pulse" value={formatStyle(partner.style, t)} label={t('profil.sport')} />
          <Tile icon="trophy" value={formatLevel(partner.level, t)} label={t('profil.niveau')} />
          <Tile
            icon="barbell"
            value={formatWeightClass(partner.weightClass, t)}
            label={t('profil.poids')}
          />
        </View>

        <Text style={styles.sectionTitle}>{t('partenaire.statistiques')}</Text>
        <View style={styles.tiles}>
          <Stat value={String(partner.fightsCount)} label={t('partenaire.combats')} />
          <Stat value={String(partner.experienceYears)} label={t('partenaire.experience')} />
          <Stat value={partner.heightCm ? String(partner.heightCm) : '—'} label={t('partenaire.taille')} />
        </View>

        <Text style={styles.sectionTitle}>{t('partenaire.aPropos')}</Text>
        <View style={styles.card}>
          <Text style={partner.bio ? styles.bio : styles.bioEmpty}>
            {partner.bio ?? t('partenaire.sansPresentation')}
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('partenaire.ecrireA', { nom: formatUserName(partner) })}
            onPress={() => router.push(`/chat/${partner.id}`)}
            style={({ pressed }) => [styles.discuter, pressed && styles.pressed]}
            testID="partner-chat"
          >
            <Ionicons name="chatbubble" size={20} color={COLORS.primary} />
          </Pressable>

          <Button
            label={t('partenaire.reserver')}
            onPress={() => router.push(`/booking/${partner.id}`)}
            disabled={!partner.available}
            icon={<Ionicons name="calendar" size={18} color={COLORS.textInverse} />}
            style={styles.reserver}
            testID="partner-book"
          />
        </View>
        {/*
          Deux avertissements, jamais ensemble : une mise en pause interdit la
          demande, un compte de versement absent ne l'interdit pas — elle partira
          et pourra être acceptée. Mais elle ne sera pas payable, et l'apprendre
          au moment de payer est le pire moment.
        */}
        {!partner.available ? (
          <Text style={styles.unavailable}>
            {t('partenaire.enPause')}
          </Text>
        ) : !partner.payoutsEnabled ? (
          <Text style={styles.unavailable} testID="partner-no-payouts">
            {t('partenaire.sansVersements')}
          </Text>
        ) : null}
      </View>

      <SecuriteSheet
        visible={securiteOuverte}
        onClose={() => setSecuriteOuverte(false)}
        userId={partner.id}
        nom={formatUserName(partner)}
        onBlocked={() => router.back()}
      />
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
  signaler: { alignSelf: 'flex-end', padding: SPACING.sm },
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
  actions: { flexDirection: 'row', gap: SPACING.sm },
  discuter: {
    alignItems: 'center',
    backgroundColor: COLORS.primarySoft,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 54,
    width: 58,
  },
  reserver: { flex: 1 },
  pressed: { opacity: 0.85 },
});
