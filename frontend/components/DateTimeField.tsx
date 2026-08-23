import React, { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

import Button from '@/components/Button';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useT } from '@/i18n';
import { formatDateTime } from '@/utils/formatting';

export interface DateTimeFieldProps {
  value: Date;
  onChange: (value: Date) => void;
  error?: string;
  label?: string;
}

/**
 * Choix de la date d'une séance, version native (iOS / Android).
 *
 * Une variante `.web.tsx` prend le relais dans un navigateur : le sélecteur natif
 * utilisé ici n'a pas d'implémentation web et casserait l'écran.
 */
export function DateTimeField({
  value,
  onChange,
  error,
  label,
}: DateTimeFieldProps) {
  const t = useT();
  const [mode, setMode] = useState<'date' | 'time' | null>(null);

  const handleChange = useCallback(
    (event: DateTimePickerEvent, selected?: Date) => {
      // Sur Android le sélecteur se ferme seul ; sur iOS il reste monté.
      if (Platform.OS === 'android') setMode(null);
      if (event.type === 'dismissed' || !selected) return;
      onChange(selected);
    },
    [onChange],
  );

  return (
    <View>
      <Text style={styles.label}>{label ?? t('reservation.dateEtHeure')}</Text>

      <View style={styles.row}>
        <Pressable style={styles.dateButton} onPress={() => setMode('date')}>
          <Ionicons name="calendar-outline" size={18} color={COLORS.primary} />
          <Text style={styles.dateText}>{formatDateTime(value.toISOString())}</Text>
        </Pressable>
        <Pressable
          style={styles.timeButton}
          onPress={() => setMode('time')}
          accessibilityLabel={t('reservation.choisirHeure')}
        >
          <Ionicons name="time-outline" size={18} color={COLORS.primary} />
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {mode ? (
        <View style={styles.picker}>
          <DateTimePicker
            value={value}
            mode={mode}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            minimumDate={new Date()}
            onChange={handleChange}
          />
          {Platform.OS === 'ios' ? (
            <Button label={t('general.enregistrer')} onPress={() => setMode(null)} variant="ghost" />
          ) : null}
        </View>
      ) : null}
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
  row: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.lg },
  dateButton: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    minHeight: 50,
    paddingHorizontal: SPACING.md,
  },
  dateText: { ...TYPOGRAPHY.body, color: COLORS.text, flex: 1 },
  timeButton: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    justifyContent: 'center',
    width: 50,
  },
  picker: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, marginBottom: SPACING.lg },
  error: { ...TYPOGRAPHY.caption, color: COLORS.error, marginBottom: SPACING.md, marginTop: -SPACING.md },
});

export default DateTimeField;
