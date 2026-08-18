import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';

interface Props {
  /** Occupe tout l'espace disponible (chargement d'écran plutôt qu'en ligne). */
  fullScreen?: boolean;
  label?: string;
  size?: 'small' | 'large';
  color?: string;
}

export function LoadingSpinner({ fullScreen = false, label, size = 'large', color = COLORS.primary }: Props) {
  return (
    <View style={[styles.container, fullScreen && styles.fullScreen]}>
      <ActivityIndicator size={size} color={color} />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  fullScreen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  label: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
});

export default LoadingSpinner;
