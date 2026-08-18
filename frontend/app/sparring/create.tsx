import React, { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useToast } from 'react-native-toast-notifications';

import Button from '@/components/Button';
import Input from '@/components/Input';
import { COLORS, LEVEL_LABELS, RADIUS, SPACING, STYLE_LABELS, TYPOGRAPHY } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { sparringService } from '@/services/sparring';
import { formatDateTime } from '@/utils/formatting';
import {
  sparringSchema,
  validate,
  type FieldErrors,
  type SparringInput,
} from '@/utils/validation';
import type { AppError, SparringLevel, SparringStyle } from '@/types';

const LEVELS = Object.keys(LEVEL_LABELS) as SparringLevel[];
const STYLES_LIST = Object.keys(STYLE_LABELS) as SparringStyle[];

/** Par défaut : demain à la même heure, arrondi à l'heure pleine. */
function defaultDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setMinutes(0, 0, 0);
  return date;
}

function Option({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.option, active && styles.optionActive]}
    >
      <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{label}</Text>
    </Pressable>
  );
}

export default function CreateSparringScreen() {
  const router = useRouter();
  const toast = useToast();
  const { invalidateSparrings } = useApp();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [scheduledAt, setScheduledAt] = useState<Date>(defaultDate);
  const [duration, setDuration] = useState('60');
  const [level, setLevel] = useState<SparringLevel>('beginner');
  const [style, setStyle] = useState<SparringStyle>('boxing');
  const [price, setPrice] = useState('20');
  const [maxParticipants, setMaxParticipants] = useState('2');

  const [pickerMode, setPickerMode] = useState<'date' | 'time' | null>(null);
  const [errors, setErrors] = useState<FieldErrors<SparringInput>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const payload = useMemo(
    () => ({
      title,
      description,
      location,
      scheduledAt: scheduledAt.toISOString(),
      // Les champs numériques transitent en texte dans les inputs : NaN si vide,
      // ce que Zod rejette avec un message dédié.
      durationMinutes: Number(duration),
      level,
      style,
      price: Number(price),
      maxParticipants: Number(maxParticipants),
    }),
    [description, duration, level, location, maxParticipants, price, scheduledAt, style, title],
  );

  const handleDateChange = useCallback(
    (event: DateTimePickerEvent, selected?: Date) => {
      // Sur Android le picker se ferme seul ; sur iOS il reste monté (spinner).
      if (Platform.OS === 'android') setPickerMode(null);
      if (event.type === 'dismissed' || !selected) return;
      setScheduledAt(selected);
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    const result = validate(sparringSchema, payload);
    setErrors(result.errors);
    if (!result.success || !result.data) return;

    setIsSubmitting(true);
    try {
      const created = await sparringService.create(result.data);
      invalidateSparrings();
      toast.show('Sparring créé !', { type: 'success' });
      // `replace` évite de revenir sur le formulaire via le bouton retour.
      router.replace(`/sparring/${created.id}`);
    } catch (caught) {
      const appError = caught as AppError;
      toast.show(appError.message, { type: 'danger' });
      if (appError.fieldErrors) {
        setErrors((previous) => ({
          ...previous,
          title: appError.fieldErrors?.title ?? previous.title,
          description: appError.fieldErrors?.description ?? previous.description,
          location: appError.fieldErrors?.location ?? previous.location,
          price: appError.fieldErrors?.price ?? previous.price,
        }));
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [invalidateSparrings, payload, router, toast]);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Input
          label="Titre"
          value={title}
          onChangeText={setTitle}
          error={errors.title}
          placeholder="Sparring boxe technique — Paris 11e"
          maxLength={80}
          testID="create-title"
        />

        <Input
          label="Description"
          value={description}
          onChangeText={setDescription}
          error={errors.description}
          placeholder="Niveau attendu, intensité, matériel requis…"
          multiline
          maxLength={1000}
          testID="create-description"
        />

        <Input
          label="Lieu"
          value={location}
          onChangeText={setLocation}
          error={errors.location}
          placeholder="Salle, ville"
          testID="create-location"
        />

        <Text style={styles.label}>Date et heure</Text>
        <View style={styles.dateRow}>
          <Pressable style={styles.dateButton} onPress={() => setPickerMode('date')}>
            <Ionicons name="calendar-outline" size={18} color={COLORS.secondary} />
            <Text style={styles.dateText}>{formatDateTime(scheduledAt.toISOString())}</Text>
          </Pressable>
          <Pressable style={styles.timeButton} onPress={() => setPickerMode('time')}>
            <Ionicons name="time-outline" size={18} color={COLORS.secondary} />
          </Pressable>
        </View>
        {errors.scheduledAt ? <Text style={styles.error}>{errors.scheduledAt}</Text> : null}

        {pickerMode ? (
          <View style={styles.pickerWrap}>
            <DateTimePicker
              value={scheduledAt}
              mode={pickerMode}
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              minimumDate={new Date()}
              onChange={handleDateChange}
            />
            {Platform.OS === 'ios' ? (
              <Button label="Valider" onPress={() => setPickerMode(null)} variant="ghost" />
            ) : null}
          </View>
        ) : null}

        <Text style={styles.label}>Niveau</Text>
        <View style={styles.optionRow}>
          {LEVELS.map((item) => (
            <Option
              key={item}
              label={LEVEL_LABELS[item] ?? item}
              active={level === item}
              onPress={() => setLevel(item)}
            />
          ))}
        </View>

        <Text style={styles.label}>Discipline</Text>
        <View style={styles.optionRow}>
          {STYLES_LIST.map((item) => (
            <Option
              key={item}
              label={STYLE_LABELS[item] ?? item}
              active={style === item}
              onPress={() => setStyle(item)}
            />
          ))}
        </View>

        <View style={styles.row}>
          <View style={styles.rowItem}>
            <Input
              label="Durée (min)"
              value={duration}
              onChangeText={setDuration}
              error={errors.durationMinutes}
              keyboardType="number-pad"
              testID="create-duration"
            />
          </View>
          <View style={styles.rowItem}>
            <Input
              label="Prix (€)"
              value={price}
              onChangeText={setPrice}
              error={errors.price}
              keyboardType="decimal-pad"
              testID="create-price"
            />
          </View>
          <View style={styles.rowItem}>
            <Input
              label="Places"
              value={maxParticipants}
              onChangeText={setMaxParticipants}
              error={errors.maxParticipants}
              keyboardType="number-pad"
              testID="create-max"
            />
          </View>
        </View>

        <Button
          label="Publier le sparring"
          onPress={handleSubmit}
          loading={isSubmitting}
          testID="create-submit"
        />
        <Button label="Annuler" onPress={() => router.back()} variant="ghost" style={styles.cancel} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: COLORS.background, flex: 1 },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  label: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
  },
  dateRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.lg },
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
  pickerWrap: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, marginBottom: SPACING.lg },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.lg },
  option: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  optionActive: { backgroundColor: COLORS.secondary, borderColor: COLORS.secondary },
  optionLabel: { ...TYPOGRAPHY.caption, color: COLORS.text },
  optionLabelActive: { color: COLORS.textInverse, fontWeight: '600' },
  row: { flexDirection: 'row', gap: SPACING.md },
  rowItem: { flex: 1 },
  error: { ...TYPOGRAPHY.caption, color: COLORS.error, marginBottom: SPACING.md, marginTop: -SPACING.md },
  cancel: { marginTop: SPACING.sm },
});
