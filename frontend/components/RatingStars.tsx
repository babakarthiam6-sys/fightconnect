import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { COLORS } from '@/constants/theme';

interface Props {
  value: number;
  size?: number;
  /** Rend les étoiles interactives : utilisé par le formulaire d'avis. */
  onChange?: (value: number) => void;
}

export function RatingStars({ value, size = 16, onChange }: Props) {
  const stars = [1, 2, 3, 4, 5];

  return (
    <View style={styles.row}>
      {stars.map((star) => {
        const filled = star <= Math.round(value);
        const icon = (
          <Ionicons
            name={filled ? 'star' : 'star-outline'}
            size={size}
            color={filled ? COLORS.accent : COLORS.disabled}
          />
        );

        if (!onChange) return <View key={star}>{icon}</View>;

        return (
          <Pressable
            key={star}
            accessibilityRole="button"
            accessibilityLabel={`Noter ${star} sur 5`}
            hitSlop={6}
            onPress={() => onChange(star)}
          >
            {icon}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 2 },
});

export default RatingStars;
