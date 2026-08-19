import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import Avatar from '@/components/Avatar';
import Badge from '@/components/Badge';
import { COLORS, RADIUS, SHADOW, SPACING, TYPOGRAPHY } from '@/constants/theme';
import {
  formatDateTime,
  formatDuration,
  formatLevel,
  formatPrice,
  formatStyle,
  formatUserName,
  truncate,
} from '@/utils/formatting';
import type { Sparring } from '@/types';

interface Props {
  sparring: Sparring;
  onPress: (sparring: Sparring) => void;
  /** Variante horizontale utilisée dans le carrousel de l'accueil. */
  compact?: boolean;
}

export function SparringCard({ sparring, onPress, compact = false }: Props) {
  const seatsLeft = Math.max(0, sparring.maxParticipants - sparring.participants.length);
  const isFull = seatsLeft === 0 || sparring.status === 'full';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Sparring ${sparring.title}`}
      onPress={() => onPress(sparring)}
      style={({ pressed }) => [styles.card, compact && styles.compact, pressed && styles.pressed]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title} numberOfLines={compact ? 1 : 2}>
          {sparring.title}
        </Text>
        <Text style={styles.price}>{formatPrice(sparring.price, sparring.currency)}</Text>
      </View>

      <View style={styles.metaRow}>
        <Ionicons name="calendar-outline" size={14} color={COLORS.textMuted} />
        <Text style={styles.meta} numberOfLines={1}>
          {formatDateTime(sparring.scheduledAt)}
        </Text>
      </View>

      <View style={styles.metaRow}>
        <Ionicons name="location-outline" size={14} color={COLORS.textMuted} />
        <Text style={styles.meta} numberOfLines={1}>
          {sparring.location || 'Lieu à confirmer'} · {formatDuration(sparring.durationMinutes)}
        </Text>
      </View>

      {!compact && sparring.description ? (
        <Text style={styles.description} numberOfLines={2}>
          {truncate(sparring.description, 140)}
        </Text>
      ) : null}

      <View style={styles.badges}>
        <Badge label={formatStyle(sparring.style)} tone="primary" icon="flame-outline" />
        <Badge label={formatLevel(sparring.level)} tone="secondary" />
        <Badge
          label={isFull ? 'Complet' : `${seatsLeft} place${seatsLeft > 1 ? 's' : ''}`}
          tone={isFull ? 'danger' : 'success'}
        />
      </View>

      <View style={styles.footer}>
        <View style={styles.creator}>
          <Avatar user={sparring.creator} size={28} />
          <Text style={styles.creatorName} numberOfLines={1}>
            {formatUserName(sparring.creator)}
          </Text>
        </View>
        <View style={styles.participants}>
          <Ionicons name="people-outline" size={14} color={COLORS.textMuted} />
          <Text style={styles.meta}>
            {sparring.participants.length}/{sparring.maxParticipants}
          </Text>
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
    gap: SPACING.xs,
    marginBottom: SPACING.md,
    padding: SPACING.lg,
  },
  compact: { marginBottom: 0, marginRight: SPACING.md, width: 260 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.995 }] },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'space-between',
  },
  title: { ...TYPOGRAPHY.subtitle, color: COLORS.text, flex: 1 },
  price: { ...TYPOGRAPHY.subtitle, color: COLORS.primary },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: SPACING.xs },
  meta: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, flexShrink: 1 },
  description: { ...TYPOGRAPHY.body, color: COLORS.textMuted, marginTop: SPACING.xs },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginTop: SPACING.sm },
  footer: {
    alignItems: 'center',
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
  },
  creator: { alignItems: 'center', flexDirection: 'row', flexShrink: 1, gap: SPACING.sm },
  creatorName: { ...TYPOGRAPHY.caption, color: COLORS.text, flexShrink: 1 },
  participants: { alignItems: 'center', flexDirection: 'row', gap: SPACING.xs },
});

export default SparringCard;
