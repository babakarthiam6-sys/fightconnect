import React, { useCallback, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useToast } from 'react-native-toast-notifications';

import Button from '@/components/Button';
import Input from '@/components/Input';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useT } from '@/i18n';
import type { AppError } from '@/types';

/**
 * Suppression du compte.
 *
 * Apple refuse toute application qui permet de créer un compte sans permettre
 * de le supprimer depuis l'application, sans écrire à personne (règle
 * 5.1.1(v)). Google exige la même chose. Cet écran n'est donc pas une
 * commodité : sans lui, l'application est rejetée.
 *
 * Il dit ce qui disparaît **et** ce qui reste, avant de demander confirmation.
 * Une suppression qui laisse des traces sans le dire est un mensonge ; une
 * suppression qui efface les messages d'un tiers en est un autre, en sens
 * inverse.
 */
export default function SupprimerLeCompteScreen() {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const { deleteAccount } = useAuth();

  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const confirmer = useCallback(async () => {
    if (!password) return;
    setIsSubmitting(true);
    try {
      await deleteAccount(password);
      toast.show(t('suppression.faite'), { type: 'success' });
      router.replace('/(auth)/welcome');
    } catch (caught) {
      // Le message vient du serveur : mot de passe faux, ou séance payée à
      // venir. Le second explique quoi faire, il ne faut pas le remplacer.
      toast.show((caught as AppError).message, { type: 'danger' });
    } finally {
      setIsSubmitting(false);
    }
  }, [deleteAccount, password, router, t, toast]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.avertissement}>
          <Ionicons name="warning-outline" size={22} color={COLORS.error} />
          <Text style={styles.avertissementTexte}>{t('suppression.avertissement')}</Text>
        </View>

        <Text style={styles.restant}>{t('suppression.restant')}</Text>

        <Text style={styles.label}>{t('suppression.confirmer')}</Text>
        <Input
          label={t('connexion.motDePasse')}
          value={password}
          onChangeText={setPassword}
          secure
          autoCapitalize="none"
          testID="delete-password"
        />

        <Button
          label={t('suppression.bouton')}
          variant="danger"
          onPress={confirmer}
          loading={isSubmitting}
          disabled={!password}
          testID="delete-confirm"
          style={styles.bouton}
        />
        <Button label={t('general.annuler')} variant="ghost" onPress={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: COLORS.background, flex: 1 },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  avertissement: {
    alignItems: 'flex-start',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.error,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACING.md,
    padding: SPACING.lg,
  },
  avertissementTexte: { ...TYPOGRAPHY.body, color: COLORS.text, flex: 1, lineHeight: 21 },
  restant: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    lineHeight: 18,
    marginTop: SPACING.lg,
  },
  label: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
    marginTop: SPACING.xl,
    textTransform: 'uppercase',
  },
  bouton: { marginTop: SPACING.lg },
});
