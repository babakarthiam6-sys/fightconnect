import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { COLORS, RADIUS, SHADOW, SPACING, TYPOGRAPHY } from '@/constants/theme';

interface Props {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint?: string;
}

export function StatCard({ label, value, icon, tint = COLORS.primary }: Props) {
  return (
    <View style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: `${tint}1A` }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...SHADOW,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    flex: 1,
    minWidth: 100,
    padding: SPACING.md,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: RADIUS.sm,
    height: 32,
    justifyContent: 'center',
    marginBottom: SPACING.sm,
    width: 32,
  },
  value: { ...TYPOGRAPHY.title, color: COLORS.text },
  label: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: 2 },
});

export default StatCard;
