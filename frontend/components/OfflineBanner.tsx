import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';

interface Props {
  /** Affiché aussi quand la connexion est revenue mais que les données viennent du cache. */
  visible: boolean;
  message?: string;
}

export function OfflineBanner({ visible, message = 'Mode hors ligne — données en cache.' }: Props) {
  if (!visible) return null;

  return (
    <View style={styles.banner}>
      <Ionicons name="cloud-offline-outline" size={14} color={COLORS.textInverse} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: 'center',
    backgroundColor: COLORS.secondary,
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  text: { ...TYPOGRAPHY.caption, color: COLORS.textInverse, fontWeight: '600' },
});

export default OfflineBanner;
