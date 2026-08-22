import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { COLORS } from '@/constants/theme';

interface Props {
  value: number;
  size?: number;
  /**
   * Nombre d'avis reçus. À zéro, aucune étoile n'est rendue : cinq étoiles
   * vides se lisent comme un 0 sur 5 et puniraient celui qui vient d'arriver.
   * Absent, on considère que la note affichée en vaut la peine — c'est le cas
   * d'un avis isolé ou du formulaire de notation.
   */
  ratingsCount?: number;
  /** Rend les étoiles interactives : utilisé par le formulaire d'avis. */
  onChange?: (value: number) => void;
}

export function RatingStars({ value, size = 16, ratingsCount, onChange }: Props) {
  const stars = [1, 2, 3, 4, 5];

  if (ratingsCount === 0) return null;

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
