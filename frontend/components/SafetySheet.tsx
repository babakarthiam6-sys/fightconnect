import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useToast } from 'react-native-toast-notifications';

import Button from '@/components/Button';
import ChipGroup from '@/components/ChipGroup';
import Input from '@/components/Input';
import { COLORS, RADIUS, REPORT_REASON_LABELS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { safetyService } from '@/services/safety';
import { confirm } from '@/utils/confirm';
import type { AppError, ReportReason, ReportSubject, ReportTargetType } from '@/types';

const REASON_IDS = Object.keys(REPORT_REASON_LABELS) as ReportReason[];

const REPORT_LABELS: Record<ReportTargetType, string> = {
  user: 'Signaler ce profil',
  message: 'Signaler ce message',
  announcement: 'Signaler cette annonce',
  announcement_reply: 'Signaler cette réponse',
};

interface Props {
  visible: boolean;
  subject: ReportSubject | null;
  /** La personne est déjà bloquée : le menu propose de la débloquer. */
  isBlocked: boolean;
  /** `report` ouvre directement le formulaire (appui long sur un message). */
  initialStep?: 'menu' | 'report';
  onClose: () => void;
  /** Appelé après un blocage ou un déblocage réussi. */
  onBlockChange?: (blocked: boolean) => void;
}

/**
 * Signaler et bloquer, depuis une fiche, une conversation ou une annonce.
 *
 * Google Play exige que ces deux gestes soient accessibles là où l'on croise
 * les autres. Les messages de confirmation passent après la fermeture de la
 * fenêtre : affichés dessous, ils resteraient invisibles sur téléphone.
 */
export function SafetySheet({
  visible,
  subject,
  isBlocked,
  initialStep = 'menu',
  onClose,
  onBlockChange,
}: Props) {
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'menu' | 'report'>(initialStep);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [isSending, setIsSending] = useState(false);

  // Chaque ouverture repart d'une fenêtre vierge.
  useEffect(() => {
    if (!visible) return;
    setStep(initialStep);
    setReason(null);
    setDetails('');
    setAlsoBlock(false);
    setReasonError(undefined);
  }, [initialStep, visible]);

  if (!subject) return null;
  const name = subject.user.firstName || 'cette personne';

  const block = async () => {
    onClose();
    const ok = await confirm({
      title: `Bloquer ${name} ?`,
      message:
        'Vous ne vous verrez plus dans l’application, et vous ne pourrez plus vous écrire ni vous réserver. ' +
        'Vous pourrez débloquer depuis votre profil.',
      confirmLabel: 'Bloquer',
      destructive: true,
    });
    if (!ok) return;
    try {
      await safetyService.block(subject.user.id);
      toast.show(`Vous avez bloqué ${name}.`, { type: 'success' });
      onBlockChange?.(true);
    } catch (caught) {
      toast.show((caught as AppError).message, { type: 'danger' });
    }
  };

  const unblock = async () => {
    onClose();
    try {
      await safetyService.unblock(subject.user.id);
      toast.show(`Vous avez débloqué ${name}.`, { type: 'success' });
      onBlockChange?.(false);
    } catch (caught) {
      toast.show((caught as AppError).message, { type: 'danger' });
    }
  };

  const send = async () => {
    if (!reason) {
      setReasonError('Choisissez un motif.');
      return;
    }
    setIsSending(true);
    try {
      await safetyService.report(subject, reason, details);
      if (alsoBlock && !isBlocked) {
        await safetyService.block(subject.user.id);
        onBlockChange?.(true);
      }
      onClose();
      toast.show('Merci. L’équipe va examiner ce signalement.', { type: 'success' });
    } catch (caught) {
      toast.show((caught as AppError).message, { type: 'danger' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />

      <KeyboardAvoidingView behavior="padding" style={styles.sheetWrapper}>
        <View style={[styles.sheet, { paddingBottom: SPACING.xl + insets.bottom }]}>
          {step === 'menu' ? (
            <View style={styles.menu}>
              <MenuItem
                icon="flag-outline"
                label={REPORT_LABELS[subject.targetType]}
                onPress={() => setStep('report')}
                testID="safety-report"
              />
              {isBlocked ? (
                <MenuItem
                  icon="lock-open-outline"
                  label={`Débloquer ${name}`}
                  onPress={() => void unblock()}
                  testID="safety-unblock"
                />
              ) : (
                <MenuItem
                  icon="ban-outline"
                  label={`Bloquer ${name}`}
                  danger
                  onPress={() => void block()}
                  testID="safety-block"
                />
              )}
              <MenuItem icon="close" label="Annuler" onPress={onClose} />
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
              <Text style={styles.title}>{REPORT_LABELS[subject.targetType]}</Text>
              <Text style={styles.hint}>
                Votre signalement est anonyme : {name} ne saura pas qu’il vient de vous.
              </Text>

              <ChipGroup
                label="Motif"
                options={REASON_IDS}
                labels={REPORT_REASON_LABELS}
                selected={reason}
                onSelect={(value) => {
                  setReason(value as ReportReason | null);
                  setReasonError(undefined);
                }}
                required
                error={reasonError}
              />

              <Input
                label="Précisions (facultatif)"
                value={details}
                onChangeText={setDetails}
                placeholder="Ce qui s’est passé, en quelques mots"
                multiline
                maxLength={500}
                testID="safety-details"
              />

              {!isBlocked ? (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: alsoBlock }}
                  onPress={() => setAlsoBlock(!alsoBlock)}
                  style={styles.checkboxRow}
                >
                  <View style={[styles.checkbox, alsoBlock && styles.checkboxChecked]}>
                    {alsoBlock ? (
                      <Ionicons name="checkmark" size={16} color={COLORS.textInverse} />
                    ) : null}
                  </View>
                  <Text style={styles.checkboxLabel}>Bloquer aussi {name}</Text>
                </Pressable>
              ) : null}
            </ScrollView>
          )}
          {/* Hors du défilement : sur un petit écran, le bouton restait sous le pli. */}
          {step === 'report' ? (
            <View style={styles.footer}>
              <Button
                label="Envoyer le signalement"
                onPress={() => void send()}
                loading={isSending}
                testID="safety-send"
              />
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
  danger = false,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
  testID?: string;
}) {
  const color = danger ? COLORS.error : COLORS.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
      testID={testID}
    >
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[styles.itemLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

/** Bouton « ⋯ » d'en-tête qui ouvre la fenêtre. */
export function SafetyMenuButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Signaler ou bloquer"
      onPress={onPress}
      hitSlop={12}
      style={styles.headerButton}
      testID="safety-menu"
    >
      <Ionicons name="ellipsis-horizontal" size={22} color={COLORS.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: COLORS.overlay, flex: 1 },
  // La limite de hauteur vit sur l'enveloppe, mesurée contre l'écran. Posée sur
  // la feuille, elle se calculait contre son propre contenu : la feuille
  // perdait 10 % de sa taille et laissait voir la page dessous.
  sheetWrapper: { maxHeight: '90%' },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    flexShrink: 1,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
  },
  menu: { gap: SPACING.xs },
  item: {
    alignItems: 'center',
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    gap: SPACING.md,
    minHeight: 52,
    paddingHorizontal: SPACING.sm,
  },
  itemPressed: { backgroundColor: COLORS.surfaceRaised },
  itemLabel: { ...TYPOGRAPHY.subtitle },
  form: { gap: SPACING.md, paddingBottom: SPACING.sm },
  footer: { paddingTop: SPACING.md },
  title: { ...TYPOGRAPHY.title, color: COLORS.text },
  hint: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, lineHeight: 18 },
  checkboxRow: { alignItems: 'center', flexDirection: 'row', gap: SPACING.md },
  checkbox: {
    alignItems: 'center',
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkboxLabel: { ...TYPOGRAPHY.body, color: COLORS.text },
  headerButton: { padding: SPACING.xs },
});

export default SafetySheet;
