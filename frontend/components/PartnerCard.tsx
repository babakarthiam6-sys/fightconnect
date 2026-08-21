import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import Avatar from '@/components/Avatar';
import Badge from '@/components/Badge';
import { COLORS, RADIUS, SHADOW, SPACING, TYPOGRAPHY } from '@/constants/theme';
import {
  formatLevel,
  formatPrice,
  formatStyle,
  formatUserName,
  formatWeightClass,
} from '@/utils/formatting';
import type { Partner } from '@/types';

interface Props {
  partner: Partner;
  onPress: (partner: Partner) => void;
  /** Variante horizontale utilisée dans le carrousel des suggestions. */
  compact?: boolean;
}

export function PartnerCard({ partner, onPress, compact = false }: Props) {
  const isNew = partner.ratingsCount === 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Partenaire ${formatUserName(partner)}`}
      onPress={() => onPress(partner)}
      style={({ pressed }) => [styles.card, compact && styles.compact, pressed && styles.pressed]}
    >
      <View style={styles.headerRow}>
        <Avatar user={partner} size={52} />

        <View style={styles.identity}>
          <Text style={styles.name} numberOfLines={1}>
            {formatUserName(partner)}
          </Text>
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={13} color={COLORS.textMuted} />
            <Text style={styles.meta} numberOfLines={1}>
              {partner.city ?? 'Ville non précisée'}
            </Text>
          </View>
        </View>

        <View style={styles.priceBlock}>
          <Text style={styles.price}>{formatPrice(partner.pricePerRound, partner.currency)}</Text>
          <Text style={styles.perRound}>/round</Text>
        </View>
      </View>

      <View style={styles.badges}>
        <Badge label={formatStyle(partner.style)} tone="primary" icon="flame-outline" />
        <Badge label={formatLevel(partner.level)} tone="secondary" />
        {partner.weightClass ? (
          <Badge label={formatWeightClass(partner.weightClass)} tone="neutral" />
        ) : null}
      </View>

      <View style={styles.footer}>
        <View style={styles.stat}>
          <Ionicons
            name={isNew ? 'sparkles-outline' : 'star'}
            size={13}
            color={isNew ? COLORS.textMuted : COLORS.warning}
          />
          <Text style={styles.meta}>
            {isNew ? 'Nouveau' : `${partner.averageRating?.toFixed(1)} (${partner.ratingsCount})`}
          </Text>
        </View>
        <View style={styles.stat}>
          <Ionicons name="trophy-outline" size={13} color={COLORS.textMuted} />
          <Text style={styles.meta}>{partner.fightsCount} combats</Text>
        </View>
        <View style={styles.stat}>
          <Ionicons name="time-outline" size={13} color={COLORS.textMuted} />
          <Text style={styles.meta}>{partner.experienceYears} ans</Text>
        </View>
      </View>
    </Pressable>
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
  compact: { marginBottom: 0, marginRight: SPACING.md, width: 280 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.995 }] },
  headerRow: { alignItems: 'center', flexDirection: 'row', gap: SPACING.md },
  identity: { flex: 1, gap: 2 },
  name: { ...TYPOGRAPHY.subtitle, color: COLORS.text },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: SPACING.xs },
  meta: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, flexShrink: 1 },
  priceBlock: { alignItems: 'flex-end' },
  price: { ...TYPOGRAPHY.subtitle, color: COLORS.primary },
  perRound: { ...TYPOGRAPHY.caption, color: COLORS.textMuted },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  footer: {
    alignItems: 'center',
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: SPACING.lg,
    marginTop: SPACING.xs,
    paddingTop: SPACING.md,
  },
  stat: { alignItems: 'center', flexDirection: 'row', gap: SPACING.xs },
});

export default PartnerCard;
