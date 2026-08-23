import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import Avatar from '@/components/Avatar';
import Badge from '@/components/Badge';
import RatingStars from '@/components/RatingStars';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useT } from '@/i18n';
import { formatRelative, formatUserName } from '@/utils/formatting';
import type { Review } from '@/types';

interface Props {
  review: Review;
}

export function ReviewCard({ review }: Props) {
  const t = useT();
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Avatar user={review.author} size={36} />
        <View style={styles.headerText}>
          <Text style={styles.author}>{formatUserName(review.author)}</Text>
          <Text style={styles.date}>{formatRelative(review.createdAt)}</Text>
        </View>
        <RatingStars value={review.rating} />
      </View>

      <Text style={styles.comment}>{review.comment}</Text>

      {review.flagged ? (
        <View style={styles.moderation}>
          <Badge label={t('avis.signale')} tone="warning" icon="warning-outline" />
          {review.flagReason ? <Text style={styles.reason}>Motif : {review.flagReason}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACING.md,
    padding: SPACING.lg,
  },
  header: { alignItems: 'center', flexDirection: 'row', gap: SPACING.sm },
  headerText: { flex: 1 },
  author: { ...TYPOGRAPHY.body, color: COLORS.text, fontWeight: '600' },
  date: { ...TYPOGRAPHY.caption, color: COLORS.textMuted },
  comment: { ...TYPOGRAPHY.body, color: COLORS.text, marginTop: SPACING.md },
  moderation: { gap: SPACING.xs, marginTop: SPACING.md },
  reason: { ...TYPOGRAPHY.caption, color: COLORS.textMuted },
});

export default ReviewCard;
