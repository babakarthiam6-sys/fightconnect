import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useToast } from 'react-native-toast-notifications';

import Button from '@/components/Button';
import ChipGroup from '@/components/ChipGroup';
import DateTimeField from '@/components/DateTimeField';
import Input from '@/components/Input';
import {
  COLORS,
  LEVEL_LABELS,
  RADIUS,
  SPACING,
  STYLE_LABELS,
  TYPOGRAPHY,
  WEIGHT_LABELS,
} from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { announcementService } from '@/services/announcement';
import {
  announcementSchema,
  validate,
  type FieldErrors,
  type AnnouncementInput,
} from '@/utils/validation';
import type {
  AnnouncementKind,
  AppError,
  SparringLevel,
  SparringStyle,
  WeightClass,
} from '@/types';

const STYLE_IDS = Object.keys(STYLE_LABELS) as SparringStyle[];
const LEVEL_IDS = Object.keys(LEVEL_LABELS) as SparringLevel[];
const WEIGHT_IDS = Object.keys(WEIGHT_LABELS) as WeightClass[];

const KINDS: {
  id: AnnouncementKind;
  title: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    id: 'sparring',
    title: 'Un sparring',
    hint: 'Un partenaire pour s’entraîner',
    icon: 'fitness-outline',
  },
  {
    id: 'fight',
    title: 'Un adversaire',
    hint: 'Pour un combat, un gala, un interclub',
    icon: 'trophy-outline',
  },
];

/** Dans deux jours à 18 h : un point de départ plausible pour une séance. */
function defaultDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 2);
  date.setHours(18, 0, 0, 0);
  return date;
}

export default function NewAnnouncementScreen() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();

  const [kind, setKind] = useState<AnnouncementKind>('sparring');
  const [style, setStyle] = useState<SparringStyle | null>(user?.style ?? null);
  const [level, setLevel] = useState<SparringLevel | null>(null);
  const [weightClass, setWeightClass] = useState<WeightClass | null>(null);
  const [city, setCity] = useState(user?.city ?? '');
  const [hasDate, setHasDate] = useState(false);
  const [date, setDate] = useState(defaultDate);
  const [message, setMessage] = useState('');
  const [fighterName, setFighterName] = useState('');
  const [fighterRecord, setFighterRecord] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [errors, setErrors] = useState<FieldErrors<AnnouncementInput> & { style?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isFight = kind === 'fight';

  const submit = useCallback(async () => {
    const parsedWeight = weightKg.trim() ? Number(weightKg.replace(',', '.')) : null;
    const result = validate(announcementSchema, {
      city,
      message,
      scheduledFor: hasDate ? date.toISOString() : null,
      fighterName: isFight && fighterName.trim() ? fighterName : null,
      fighterRecord: isFight && fighterRecord.trim() ? fighterRecord : null,
      weightKg: isFight ? parsedWeight : null,
    });
    const styleError = style ? undefined : 'Choisissez une discipline.';
    const data = result.data;
    if (!data || !style) {
      setErrors({ ...result.errors, style: styleError });
      return;
    }
    setErrors({});

    setIsSubmitting(true);
    try {
      const created = await announcementService.create({
        kind,
        style,
        level,
        weightClass,
        city: data.city,
        message: data.message,
        scheduledFor: data.scheduledFor,
        fighterName: data.fighterName,
        fighterRecord: data.fighterRecord,
        weightKg: data.weightKg,
        videoUrl: videoUrl.trim() || null,
      });
      toast.show('Annonce publiée', { type: 'success' });
      router.replace(`/announcement/${created.id}`);
    } catch (caught) {
      toast.show((caught as AppError).message, { type: 'danger' });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    city,
    date,
    fighterName,
    fighterRecord,
    hasDate,
    isFight,
    kind,
    level,
    message,
    router,
    style,
    toast,
    videoUrl,
    weightClass,
    weightKg,
  ]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionTitle}>Vous cherchez…</Text>
        <View style={styles.kinds}>
          {KINDS.map((option) => {
            const active = option.id === kind;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                onPress={() => setKind(option.id)}
                style={[styles.kind, active && styles.kindActive]}
                testID={`announcement-kind-${option.id}`}
              >
                <Ionicons
                  name={option.icon}
                  size={26}
                  color={active ? COLORS.primary : COLORS.textMuted}
                />
                <Text style={[styles.kindTitle, active && styles.kindTitleActive]}>
                  {option.title}
                </Text>
                <Text style={styles.kindHint}>{option.hint}</Text>
              </Pressable>
            );
          })}
        </View>

        <ChipGroup
          label="Discipline"
          options={STYLE_IDS}
          labels={STYLE_LABELS}
          selected={style}
          onSelect={(value) => setStyle(value as SparringStyle | null)}
          required
          error={errors.style}
        />

        <Input
          label="Ville"
          value={city}
          onChangeText={setCity}
          placeholder="Valence, Madrid…"
          autoCapitalize="words"
          error={errors.city}
          testID="announcement-city"
        />

        <Input
          label={isFight ? 'Le combat' : 'Ce que vous cherchez'}
          value={message}
          onChangeText={setMessage}
          placeholder={
            isFight
              ? 'Gala amateur le 12 décembre, 3 × 2 min, cherche adversaire de niveau équivalent…'
              : '4 rounds techniques le jeudi soir, quelqu’un de mon poids…'
          }
          multiline
          maxLength={600}
          error={errors.message}
          testID="announcement-message"
        />

        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.switchLabel}>Date précise</Text>
            <Text style={styles.switchHint}>
              {hasDate
                ? 'L’annonce disparaît une fois la date passée.'
                : 'Sans date, l’annonce reste en ligne un mois.'}
            </Text>
          </View>
          <Switch
            value={hasDate}
            onValueChange={setHasDate}
            trackColor={{ true: COLORS.primary, false: COLORS.disabled }}
            thumbColor={COLORS.text}
            accessibilityLabel="Date précise"
          />
        </View>
        {hasDate ? (
          <DateTimeField value={date} onChange={setDate} error={errors.scheduledFor} />
        ) : null}

        <ChipGroup
          label="Niveau (facultatif)"
          options={LEVEL_IDS}
          labels={LEVEL_LABELS}
          selected={level}
          onSelect={(value) => setLevel(value as SparringLevel | null)}
        />

        <ChipGroup
          label="Catégorie de poids (facultatif)"
          options={WEIGHT_IDS}
          labels={WEIGHT_LABELS}
          selected={weightClass}
          onSelect={(value) => setWeightClass(value as WeightClass | null)}
        />

        {isFight ? (
          <View style={styles.fighter}>
            <Text style={styles.sectionTitle}>Le combattant</Text>
            <Text style={styles.sectionHint}>
              Vous êtes coach ? Décrivez l’élève pour qui vous cherchez un adversaire. Sinon,
              laissez vide : votre profil suffit.
            </Text>
            <Input
              label="Nom (facultatif)"
              value={fighterName}
              onChangeText={setFighterName}
              placeholder="Yanis K."
              maxLength={60}
              error={errors.fighterName}
            />
            <View style={styles.row}>
              <View style={styles.flex}>
                <Input
                  label="Palmarès"
                  value={fighterRecord}
                  onChangeText={setFighterRecord}
                  placeholder="8-2-0"
                  maxLength={40}
                  error={errors.fighterRecord}
                />
              </View>
              <View style={styles.flex}>
                <Input
                  label="Poids (kg)"
                  value={weightKg}
                  onChangeText={setWeightKg}
                  placeholder="70"
                  keyboardType="decimal-pad"
                  error={errors.weightKg}
                />
              </View>
            </View>
          </View>
        ) : null}

        <Input
          label="Lien vidéo (facultatif)"
          value={videoUrl}
          onChangeText={setVideoUrl}
          placeholder="YouTube, TikTok ou Instagram"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          hint="Un combat ou un sparring : c’est ce qui aide le plus à vous répondre."
        />

        <Text style={styles.notice}>
          Pas de numéro de téléphone ni de moyen de paiement extérieur : les annonces sont modérées,
          et la discussion se fait dans l’application.
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Publier l’annonce"
          onPress={submit}
          loading={isSubmitting}
          testID="announcement-submit"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: COLORS.background, flex: 1 },
  content: { gap: SPACING.lg, padding: SPACING.lg, paddingBottom: SPACING.xxl },
  sectionTitle: { ...TYPOGRAPHY.title, color: COLORS.text },
  sectionHint: { ...TYPOGRAPHY.body, color: COLORS.textMuted, marginTop: -SPACING.sm },
  kinds: { flexDirection: 'row', gap: SPACING.md, marginTop: -SPACING.sm },
  kind: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    flex: 1,
    gap: SPACING.xs,
    padding: SPACING.md,
  },
  kindActive: { backgroundColor: COLORS.primarySoft, borderColor: COLORS.primary },
  kindTitle: { ...TYPOGRAPHY.subtitle, color: COLORS.text },
  kindTitleActive: { color: COLORS.primary },
  kindHint: { ...TYPOGRAPHY.caption, color: COLORS.textMuted },
  switchRow: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    flexDirection: 'row',
    gap: SPACING.md,
    padding: SPACING.md,
  },
  switchText: { flex: 1, gap: 2 },
  switchLabel: { ...TYPOGRAPHY.subtitle, color: COLORS.text },
  switchHint: { ...TYPOGRAPHY.caption, color: COLORS.textMuted },
  fighter: { gap: SPACING.md },
  row: { flexDirection: 'row', gap: SPACING.md },
  flex: { flex: 1 },
  notice: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, lineHeight: 18 },
  footer: { borderTopColor: COLORS.border, borderTopWidth: 1, padding: SPACING.lg },
});
