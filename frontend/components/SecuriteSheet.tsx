import React, { useCallback, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useToast } from 'react-native-toast-notifications';

import Button from '@/components/Button';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useT, type Cle } from '@/i18n';
import { MOTIFS, securiteService, type Motif } from '@/services/securite';
import type { AppError } from '@/types';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Personne visée. Le blocage et le signalement portent tous deux sur elle. */
  userId: string;
  nom: string;
  /** Appelé après un blocage réussi : l'écran appelant doit quitter la fiche. */
  onBlocked?: () => void;
}

/**
 * Signaler ou bloquer quelqu'un.
 *
 * Les deux magasins exigent ces deux gestes dans toute application où les gens
 * s'écrivent, et exigent qu'ils soient **atteignables depuis le contenu
 * lui-même** — pas enfouis dans un menu de réglages. La feuille s'ouvre donc
 * depuis la fiche du partenaire et depuis la conversation.
 *
 * Signaler et bloquer ne font pas la même chose, et l'écran le montre :
 * signaler demande à la plateforme de regarder, sans effet immédiat et sans
 * que la personne visée le sache ; bloquer décide tout de suite, sans recours,
 * et coupe tout.
 */
export function SecuriteSheet({ visible, onClose, userId, nom, onBlocked }: Props) {
  const t = useT();
  const toast = useToast();
  const [motif, setMotif] = useState<Motif | null>(null);
  const [busy, setBusy] = useState(false);

  const fermer = useCallback(() => {
    setMotif(null);
    onClose();
  }, [onClose]);

  const signaler = useCallback(async () => {
    if (!motif) return;
    setBusy(true);
    try {
      await securiteService.signaler('user', userId, motif);
      toast.show(t('securite.envoye'), { type: 'success' });
      fermer();
    } catch (caught) {
      toast.show((caught as AppError).message, { type: 'danger' });
    } finally {
      setBusy(false);
    }
  }, [fermer, motif, t, toast, userId]);

  const bloquer = useCallback(async () => {
    setBusy(true);
    try {
      await securiteService.bloquer(userId);
      toast.show(t('securite.bloque'), { type: 'success' });
      fermer();
      onBlocked?.();
    } catch (caught) {
      toast.show((caught as AppError).message, { type: 'danger' });
    } finally {
      setBusy(false);
    }
  }, [fermer, onBlocked, t, toast, userId]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={fermer}>
      <Pressable style={styles.backdrop} onPress={fermer} />

      <View style={styles.sheet}>
        <Text style={styles.titre}>{t('securite.signalerCette', { nom })}</Text>
        <Text style={styles.question}>{t('securite.motif')}</Text>

        <View style={styles.motifs}>
          {MOTIFS.map((choix) => {
            const actif = motif === choix;
            return (
              <Pressable
                key={choix}
                accessibilityRole="button"
                accessibilityState={{ selected: actif }}
                onPress={() => setMotif(actif ? null : choix)}
                style={[styles.motif, actif && styles.motifActif]}
              >
                <Text style={[styles.motifLabel, actif && styles.motifLabelActif]}>
                  {t(`motif.${choix}` as Cle)}
                </Text>
                {actif ? (
                  <Ionicons name="checkmark" size={18} color={COLORS.textInverse} />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <Button
          label={t('securite.signaler')}
          onPress={signaler}
          loading={busy}
          disabled={!motif}
          testID="securite-signaler"
        />

        <View style={styles.separateur} />

        {/*
          Le blocage est séparé du signalement par un trait : ce n'est pas une
          variante plus forte du même geste, c'est une décision personnelle qui
          prend effet immédiatement.
        */}
        <Text style={styles.blocageTexte}>{t('securite.bloquerTexte')}</Text>
        <Button
          label={t('securite.bloquerCette', { nom })}
          variant="danger"
          onPress={bloquer}
          loading={busy}
          testID="securite-bloquer"
        />
        <Button label={t('general.fermer')} variant="ghost" onPress={fermer} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.6)', flex: 1 },
  sheet: {
    backgroundColor: COLORS.surfaceRaised,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    gap: SPACING.sm,
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  titre: { ...TYPOGRAPHY.subtitle, color: COLORS.text },
  question: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginBottom: SPACING.sm },
  motifs: { gap: SPACING.xs, marginBottom: SPACING.md },
  motif: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  motifActif: { backgroundColor: COLORS.primary },
  motifLabel: { ...TYPOGRAPHY.body, color: COLORS.text },
  motifLabelActif: { color: COLORS.textInverse, fontWeight: '600' },
  separateur: {
    backgroundColor: COLORS.border,
    height: 1,
    marginVertical: SPACING.lg,
  },
  blocageTexte: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    lineHeight: 18,
    marginBottom: SPACING.sm,
  },
});

export default SecuriteSheet;
