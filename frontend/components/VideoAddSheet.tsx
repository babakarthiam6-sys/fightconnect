import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import Button from '@/components/Button';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import type { VideoKind } from '@/types';

const KINDS: { id: VideoKind; label: string }[] = [
  { id: 'fight', label: 'Combat' },
  { id: 'sparring', label: 'Sparring' },
  { id: 'shadow', label: 'Shadow' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: { url: string; kind: VideoKind; caption: string }) => Promise<void>;
}

/**
 * Ajout d'une vidéo à sa galerie.
 *
 * On demande un lien, pas un fichier : les combattants filment déjà sur TikTok
 * et Instagram, et coller une adresse qu'ils ont sous la main leur coûte moins
 * qu'un téléversement.
 */
export function VideoAddSheet({ visible, onClose, onSubmit }: Props) {
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState<VideoKind>('sparring');
  const [caption, setCaption] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setUrl('');
      setKind('sparring');
      setCaption('');
      setIsSaving(false);
    }
  }, [visible]);

  const submit = async () => {
    if (!url.trim() || isSaving) return;
    setIsSaving(true);
    try {
      await onSubmit({ url, kind, caption });
    } finally {
      // L'écran appelant ferme la feuille en cas de succès ; en cas d'erreur on
      // rend la main pour que le lien reste corrigeable sans tout ressaisir.
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={styles.sheet}>
        <Text style={styles.title}>Ajouter une vidéo</Text>
        <Text style={styles.hint}>
          Colle le lien d’une vidéo YouTube, TikTok ou Instagram. Elle se lira sur la
          plateforme d’origine.
        </Text>

        <TextInput
          value={url}
          onChangeText={setUrl}
          placeholder="https://…"
          placeholderTextColor={COLORS.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          autoFocus
          style={styles.input}
        />

        <View style={styles.kinds}>
          {KINDS.map((option) => {
            const isActive = kind === option.id;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                onPress={() => setKind(option.id)}
                style={[styles.kind, isActive && styles.kindActive]}
              >
                <Text style={[styles.kindLabel, isActive && styles.kindLabelActive]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="Légende (facultatif)"
          placeholderTextColor={COLORS.textMuted}
          maxLength={120}
          style={styles.input}
        />

        <Button label="Ajouter" onPress={() => void submit()} loading={isSaving} />
        <Button label="Annuler" variant="ghost" onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: COLORS.overlay,
    flex: 1,
  },
  hint: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginBottom: SPACING.lg,
  },
  input: {
    ...TYPOGRAPHY.body,
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.md,
    color: COLORS.text,
    marginBottom: SPACING.md,
    padding: SPACING.md,
  },
  kind: {
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.pill,
    flex: 1,
    paddingVertical: SPACING.sm,
  },
  kindActive: {
    backgroundColor: COLORS.primary,
  },
  kindLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
    fontWeight: '600',
    textAlign: 'center',
  },
  kindLabelActive: {
    color: COLORS.textInverse,
  },
  kinds: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.xl,
  },
  title: {
    ...TYPOGRAPHY.title,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
});
