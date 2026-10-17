import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import Avatar from '@/components/Avatar';
import Badge from '@/components/Badge';
import {
  ANNOUNCEMENT_KIND_LABELS,
  COLORS,
  RADIUS,
  SHADOW,
  SPACING,
  TYPOGRAPHY,
} from '@/constants/theme';
import {
  formatCount,
  formatDateTime,
  formatLevel,
  formatStyle,
  formatUserName,
  formatWeightClass,
} from '@/utils/formatting';
import type { Announcement } from '@/types';

interface Props {
  announcement: Announcement;
  onPress: (announcement: Announcement) => void;
}

/** Le poids qui compte : celui du combattant s'il est donné, sinon la catégorie. */
export function announcementWeight(announcement: Announcement): string | null {
  if (announcement.weightKg != null) return `${String(announcement.weightKg).replace('.', ',')} kg`;
  return announcement.weightClass ? formatWeightClass(announcement.weightClass) : null;
}

export function AnnouncementCard({ announcement, onPress }: Props) {
  const isFight = announcement.kind === 'fight';
  const weight = announcementWeight(announcement);
  const closed = announcement.status === 'closed';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Annonce ${ANNOUNCEMENT_KIND_LABELS[announcement.kind]} ${formatStyle(
        announcement.style,
      )} à ${announcement.city}`}
      onPress={() => onPress(announcement)}
      style={({ pressed }) => [styles.card, closed && styles.closed, pressed && styles.pressed]}
    >
      <View style={styles.badges}>
        <Badge
          label={ANNOUNCEMENT_KIND_LABELS[announcement.kind] ?? announcement.kind}
          tone={isFight ? 'danger' : 'primary'}
          icon={isFight ? 'trophy-outline' : 'fitness-outline'}
        />
        <Badge label={formatStyle(announcement.style)} tone="neutral" />
        {announcement.level ? (
          <Badge label={formatLevel(announcement.level)} tone="secondary" />
        ) : null}
        {closed ? <Badge label="Pourvue" tone="success" icon="checkmark" /> : null}
      </View>

      <Text style={styles.message} numberOfLines={3}>
        {announcement.message}
      </Text>

      <View style={styles.meta}>
        <Meta icon="location-outline" text={announcement.city} />
        <Meta
          icon="calendar-outline"
          text={
            announcement.scheduledFor
              ? formatDateTime(announcement.scheduledFor)
              : 'Date à convenir'
          }
        />
        {weight ? <Meta icon="barbell-outline" text={weight} /> : null}
      </View>

      <View style={styles.footer}>
        <View style={styles.author}>
          {announcement.author ? <Avatar user={announcement.author} size={26} /> : null}
          <Text style={styles.authorName} numberOfLines={1}>
            {announcement.isMine
              ? 'Votre annonce'
              : announcement.fighterName
                ? `${formatUserName(announcement.author)} pour ${announcement.fighterName}`
                : formatUserName(announcement.author)}
          </Text>
        </View>
        {announcement.hasReplied ? (
          <View style={styles.stat}>
            <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
            <Text style={[styles.statText, styles.replied]}>Vous avez répondu</Text>
          </View>
        ) : (
          <View style={styles.stat}>
            <Ionicons name="chatbubbles-outline" size={14} color={COLORS.textMuted} />
            <Text style={styles.statText}>{formatCount(announcement.repliesCount, 'réponse')}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function Meta({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.metaItem}>
      <Ionicons name={icon} size={13} color={COLORS.textMuted} />
      <Text style={styles.metaText} numberOfLines={1}>
        {text}
      </Text>
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
  closed: { opacity: 0.7 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.995 }] },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  message: { ...TYPOGRAPHY.body, color: COLORS.text, fontSize: 15, lineHeight: 21 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: SPACING.md, rowGap: SPACING.xs },
  metaItem: { alignItems: 'center', flexDirection: 'row', gap: SPACING.xs, maxWidth: '100%' },
  metaText: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, flexShrink: 1 },
  footer: {
    alignItems: 'center',
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: SPACING.md,
    justifyContent: 'space-between',
    marginTop: SPACING.xs,
    paddingTop: SPACING.md,
  },
  author: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: SPACING.sm },
  authorName: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, flexShrink: 1, fontWeight: '600' },
  stat: { alignItems: 'center', flexDirection: 'row', gap: SPACING.xs },
  statText: { ...TYPOGRAPHY.caption, color: COLORS.textMuted },
  replied: { color: COLORS.success, fontWeight: '600' },
});

export default AnnouncementCard;
