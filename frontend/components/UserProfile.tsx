import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import Avatar from '@/components/Avatar';
import Badge from '@/components/Badge';
import RatingStars from '@/components/RatingStars';
import { COLORS, RADIUS, SHADOW, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useT } from '@/i18n';
import { formatRating } from '@/utils/formatting';
import type { User, UserRiskProfile } from '@/types';

interface Props {
  user: User;
  riskProfile?: UserRiskProfile | null;
  /** Masque l'email quand la carte décrit un tiers et non l'utilisateur courant. */
  showEmail?: boolean;
}

const RISK_TONES = {
  low: { tone: 'success', cle: 'profil.fiable' },
  medium: { tone: 'warning', cle: 'profil.vigilance' },
  high: { tone: 'danger', cle: 'profil.risque' },
} as const;

export function UserProfile({ user, riskProfile, showEmail = true }: Props) {
  const t = useT();
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
          {user.ratingsCount > 0
            ? ` ${t('partenaire.avis', { n: user.ratingsCount })}`
            : t('profil.aucunAvis')}
        </Text>
      </View>

      <View style={styles.badges}>
        {user.dischargeAccepted ? (
          <Badge label={t('profil.dechargeSignee')} tone="secondary" icon="document-text-outline" />
        ) : (
          <Badge label={t('profil.dechargeASigner')} tone="danger" icon="alert-circle-outline" />
        )}
        {risk ? (
          <Badge label={t(risk.cle)} tone={risk.tone} icon="shield-checkmark-outline" />
        ) : null}
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
