import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import Button from '@/components/Button';
import type { AppError } from '@/types';

interface Props {
  error: AppError;
  onRetry?: () => void;
}

/** Écran d'erreur bloquante, avec relance manuelle. */
export function ErrorView({ error, onRetry }: Props) {
  return (
    <View style={styles.container}>
      <Ionicons
        name={error.isNetworkError ? 'cloud-offline-outline' : 'alert-circle-outline'}
        size={44}
        color={COLORS.error}
      />
      <Text style={styles.title}>
        {error.isNetworkError ? 'Connexion indisponible' : 'Oups…'}
      </Text>
      <Text style={styles.message}>{error.message}</Text>
      {onRetry ? (
        <Button label="Réessayer" onPress={onRetry} variant="outline" fullWidth={false} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xxl,
  },
  title: { ...TYPOGRAPHY.subtitle, color: COLORS.text, marginTop: SPACING.md },
  message: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  action: { marginTop: SPACING.lg },
});

export default ErrorView;
