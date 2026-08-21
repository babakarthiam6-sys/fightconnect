import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  /** Affiche un indicateur et bloque les appuis. */
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const BACKGROUNDS: Record<Variant, string> = {
  primary: COLORS.primary,
  secondary: COLORS.secondary,
  outline: 'transparent',
  danger: COLORS.error,
  ghost: 'transparent',
};

// Sur fond sombre, un contour bleu marine disparaît : les variantes sans aplat
// reprennent l'orange, qui reste la couleur d'action de l'application.
const LABEL_COLORS: Record<Variant, string> = {
  primary: COLORS.textInverse,
  secondary: COLORS.textInverse,
  outline: COLORS.primary,
  danger: COLORS.textInverse,
  ghost: COLORS.primary,
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  fullWidth = true,
  icon,
  style,
  testID,
}: Props) {
  const isInactive = disabled || loading;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: isInactive, busy: loading }}
      onPress={onPress}
      disabled={isInactive}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: BACKGROUNDS[variant] },
        variant === 'outline' && styles.outline,
        fullWidth && styles.fullWidth,
        isInactive && styles.inactive,
        // Retour tactile immédiat, sans dépendance d'animation externe.
        pressed && !isInactive && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={LABEL_COLORS[variant]} size="small" />
      ) : (
        <View style={styles.content}>
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          <Text style={[styles.label, { color: LABEL_COLORS[variant] }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: SPACING.lg,
  },
  fullWidth: { alignSelf: 'stretch' },
  outline: {
    borderColor: COLORS.primary,
    borderWidth: 1.5,
  },
  inactive: { opacity: 0.55 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  content: { alignItems: 'center', flexDirection: 'row', gap: SPACING.sm },
  icon: { alignItems: 'center', justifyContent: 'center' },
  label: { ...TYPOGRAPHY.button },
});

export default Button;
