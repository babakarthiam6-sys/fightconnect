import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/theme';

interface Props {
  label: string;
  options: string[];
  labels: Record<string, string>;
  selected: string | null;
  onSelect: (value: string | null) => void;
  /** Champ obligatoire : réappuyer sur la pastille active ne la retire pas. */
  required?: boolean;
  error?: string;
}

/** Choix unique parmi une liste de pastilles : sport, niveau, catégorie… */
export function ChipGroup({
  label,
  options,
  labels,
  selected,
  onSelect,
  required = false,
  error,
}: Props) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View style={styles.chips}>
        {options.map((option) => {
          const isActive = selected === option;
          return (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              // Réappuyer sur un filtre actif le retire : c'est le geste attendu,
              // et cela évite d'avoir à revenir sur « Effacer » pour un seul critère.
              onPress={() => onSelect(isActive && !required ? null : option)}
              style={[styles.chip, isActive && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>
                {labels[option]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: SPACING.sm },
  groupLabel: { ...TYPOGRAPHY.title, color: COLORS.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipLabel: { ...TYPOGRAPHY.body, color: COLORS.textMuted },
  chipLabelActive: { color: COLORS.textInverse, fontWeight: '600' },
  error: { ...TYPOGRAPHY.caption, color: COLORS.error },
});

export default ChipGroup;
