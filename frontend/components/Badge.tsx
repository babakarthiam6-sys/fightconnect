import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/theme';

type Tone = 'neutral' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger';

interface Props {
  label: string;
  tone?: Tone;
  icon?: keyof typeof Ionicons.glyphMap;
}

const TONES: Record<Tone, { background: string; text: string }> = {
  neutral: { background: COLORS.surfaceRaised, text: COLORS.textMuted },
  primary: { background: COLORS.primarySoft, text: COLORS.primary },
  secondary: { background: COLORS.secondarySoft, text: COLORS.secondary },
  success: { background: COLORS.successSoft, text: COLORS.success },
  warning: { background: COLORS.warningSoft, text: COLORS.warning },
  danger: { background: COLORS.errorSoft, text: COLORS.error },
};

export function Badge({ label, tone = 'neutral', icon }: Props) {
  const palette = TONES[tone];

  return (
    <View style={[styles.badge, { backgroundColor: palette.background }]}>
      {icon ? <Ionicons name={icon} size={12} color={palette.text} /> : null}
      <Text style={[styles.label, { color: palette.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: RADIUS.pill,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 4,
  },
  label: { ...TYPOGRAPHY.caption, fontWeight: '600' },
});

export default Badge;
