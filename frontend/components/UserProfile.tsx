import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import Avatar from '@/components/Avatar';
import Badge from '@/components/Badge';
import RatingStars from '@/components/RatingStars';
import { COLORS, RADIUS, SHADOW, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { formatRating } from '@/utils/formatting';
import type { User, UserRiskProfile } from '@/types';

interface Props {
  user: User;
  riskProfile?: UserRiskProfile | null;
  /** Masque l'email quand la carte décrit un tiers et non l'utilisateur courant. */
  showEmail?: boolean;
}

const RISK_TONES = {
  low: { tone: 'success', label: 'Profil fiable' },
  medium: { tone: 'warning', label: 'Vigilance modérée' },
  high: { tone: 'danger', label: 'Profil à risque' },
} as const;

export function UserProfile({ user, riskProfile, showEmail = true }: Props) {
  const risk = riskProfile ? RISK_TONES[riskProfile.riskLevel] : null;

  return (
    <View style={styles.card}>
      <Avatar user={user} size={72} />

      <Text style={styles.name}>
        {user.firstName} {user.lastName}
      </Text>

      {showEmail && user.email ? <Text style={styles.email}>{user.email}</Text> : null}

      <View style={styles.ratingRow}>
        <RatingStars value={user.averageRating ?? 0} size={18} ratingsCount={user.ratingsCount} />
        <Text style={styles.ratingText}>
          {formatRating(user.averageRating)}
          {user.ratingsCount > 0 ? ` (${user.ratingsCount} avis)` : ' (aucun avis)'}
        </Text>
      </View>

      <View style={styles.badges}>
        {user.dischargeAccepted ? (
          <Badge label="Décharge signée" tone="secondary" icon="document-text-outline" />
        ) : (
          <Badge label="Décharge à signer" tone="danger" icon="alert-circle-outline" />
        )}
        {risk ? <Badge label={risk.label} tone={risk.tone} icon="shield-checkmark-outline" /> : null}
      </View>

      {riskProfile && riskProfile.reasons.length > 0 ? (
        <View style={styles.reasons}>
          {riskProfile.reasons.slice(0, 3).map((reason) => (
            <View key={reason} style={styles.reasonRow}>
              <Ionicons name="ellipse" size={6} color={COLORS.textMuted} />
              <Text style={styles.reasonText}>{reason}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...SHADOW,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
  },
  name: { ...TYPOGRAPHY.headline, color: COLORS.text, marginTop: SPACING.md, textAlign: 'center' },
  email: { ...TYPOGRAPHY.body, color: COLORS.textMuted, marginTop: SPACING.xs },
  ratingRow: { alignItems: 'center', flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  ratingText: { ...TYPOGRAPHY.body, color: COLORS.textMuted },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    justifyContent: 'center',
    marginTop: SPACING.md,
  },
  reasons: { alignSelf: 'stretch', gap: SPACING.xs, marginTop: SPACING.md },
  reasonRow: { alignItems: 'center', flexDirection: 'row', gap: SPACING.sm },
  reasonText: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, flex: 1 },
});

export default UserProfile;
