import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import Button from '@/components/Button';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useT } from '@/i18n';

type Kind = 'text' | 'number' | 'choice';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** Valeur affichée. `null` rend « Non défini », en gris. */
  value: string | null;
  kind?: Kind;
  /** Options d'un champ `choice`, sous forme { identifiant: libellé }. */
  options?: Record<string, string>;
  /** Valeur brute courante, utilisée pour cocher la bonne option. */
  current?: string | number | null;
  placeholder?: string;
  multiline?: boolean;
  suffix?: string;
  onSave: (value: string | number | null) => Promise<void>;
}

/**
 * Une ligne de profil, modifiable au toucher.
 *
 * L'édition se fait dans une feuille dédiée plutôt qu'en ligne : sur un
 * téléphone, un champ qui s'ouvre au milieu d'une liste passe sous le clavier.
 */
export function ProfileField({
  icon,
  label,
  value,
  kind = 'text',
  options,
  current,
  placeholder,
  multiline = false,
  suffix,
  onSave,
}: Props) {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) setDraft(current === null || current === undefined ? '' : String(current));
  }, [current, isOpen]);

  const commit = useCallback(
    async (next: string | number | null) => {
      setIsSaving(true);
      try {
        await onSave(next);
        setIsOpen(false);
      } finally {
        setIsSaving(false);
      }
    },
    [onSave],
  );

  const saveText = useCallback(() => {
    const trimmed = draft.trim();
    if (kind === 'number') {
      const parsed = Number(trimmed.replace(',', '.'));
      return commit(trimmed === '' ? null : Number.isFinite(parsed) ? parsed : null);
    }
    return commit(trimmed === '' ? null : trimmed);
  }, [commit, draft, kind]);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} : ${value ?? t('general.nonDefiniMinuscule')}`}
        onPress={() => setIsOpen(true)}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <Ionicons name={icon} size={20} color={COLORS.primary} />
        <Text style={styles.label}>{label}</Text>
        <Text style={value ? styles.value : styles.empty} numberOfLines={1}>
          {value ?? t('general.nonDefini')}
          {value && suffix ? ` ${suffix}` : ''}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
      </Pressable>

      <Modal
        visible={isOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setIsOpen(false)} />

        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{label}</Text>

          {kind === 'choice' && options ? (
            <View style={styles.choices}>
              {Object.entries(options).map(([id, optionLabel]) => {
                const isActive = current === id;
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    onPress={() => void commit(isActive ? null : id)}
                    style={[styles.choice, isActive && styles.choiceActive]}
                  >
                    <Text style={[styles.choiceLabel, isActive && styles.choiceLabelActive]}>
                      {optionLabel}
                    </Text>
                    {isActive ? (
                      <Ionicons name="checkmark" size={18} color={COLORS.textInverse} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={placeholder}
                placeholderTextColor={COLORS.textMuted}
                keyboardType={kind === 'number' ? 'numeric' : 'default'}
                multiline={multiline}
                autoFocus
                style={[styles.input, multiline && styles.inputMultiline]}
              />
              <Button label={t('general.enregistrer')} onPress={saveText} loading={isSaving} />
            </>
          )}

          <Button label={t('general.fermer')} variant="ghost" onPress={() => setIsOpen(false)} />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
  },
  pressed: { opacity: 0.85 },
  label: { ...TYPOGRAPHY.body, color: COLORS.text, flex: 1, fontSize: 15 },
  value: { ...TYPOGRAPHY.body, color: COLORS.text, flexShrink: 1 },
  empty: { ...TYPOGRAPHY.body, color: COLORS.textMuted },
  backdrop: { backgroundColor: COLORS.overlay, flex: 1 },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    gap: SPACING.md,
    padding: SPACING.xl,
  },
  sheetTitle: { ...TYPOGRAPHY.title, color: COLORS.text },
  input: {
    ...TYPOGRAPHY.body,
    backgroundColor: COLORS.surfaceRaised,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    color: COLORS.text,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  inputMultiline: { minHeight: 120, textAlignVertical: 'top' },
  choices: { gap: SPACING.sm },
  choice: {
    alignItems: 'center',
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  choiceActive: { backgroundColor: COLORS.primary },
  choiceLabel: { ...TYPOGRAPHY.body, color: COLORS.text, fontSize: 15 },
  choiceLabelActive: { color: COLORS.textInverse, fontWeight: '600' },
});

export default ProfileField;
