import React, { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import type { DateTimeFieldProps } from '@/components/DateTimeField';

/**
 * Choix de la date, version navigateur.
 *
 * `@react-native-community/datetimepicker` n'a aucune implémentation web : monté
 * dans un navigateur, il casse l'écran. On s'appuie donc sur le champ natif du
 * navigateur, qui ouvre de surcroît le sélecteur du système sur iOS et Android.
 */

/** Format attendu par `datetime-local` : AAAA-MM-JJTHH:MM, en heure locale. */
function toInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function DateTimeField({
  value,
  onChange,
  error,
  label = 'Date et heure',
}: DateTimeFieldProps) {
  const handleChange = useCallback(
    (event: { target: { value: string } }) => {
      const parsed = new Date(event.target.value);
      // Une saisie incomplète produit une date invalide : on ignore, sans quoi
      // l'état du formulaire deviendrait « Invalid Date ».
      if (!Number.isNaN(parsed.getTime())) onChange(parsed);
    },
    [onChange],
  );

  return (
    <View>
      <Text style={styles.label}>{label}</Text>

      {React.createElement('input', {
        type: 'datetime-local',
        value: toInputValue(value),
        min: toInputValue(new Date()),
        onChange: handleChange,
        'aria-label': label,
        style: {
          width: '100%',
          minHeight: 50,
          boxSizing: 'border-box',
          padding: `0 ${SPACING.md}px`,
          marginBottom: SPACING.lg,
          border: `1.5px solid ${COLORS.border}`,
          borderRadius: RADIUS.md,
          backgroundColor: COLORS.surface,
          color: COLORS.text,
          fontFamily: 'inherit',
          fontSize: TYPOGRAPHY.body.fontSize,
        },
      })}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
  },
  error: { ...TYPOGRAPHY.caption, color: COLORS.error, marginBottom: SPACING.md, marginTop: -SPACING.md },
});

export default DateTimeField;
