import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import Button from '@/components/Button';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useT, type Cle } from '@/i18n';
import { useDischargeStore } from '@/store/discharge';

/** Six clauses, numérotées : le texte de chacune vit dans le catalogue. */
const CLAUSES = [1, 2, 3, 4, 5, 6] as const;

/**
 * Décharge de responsabilité, obligatoire avant toute inscription.
 *
 * L'acceptation transite par un store partagé : l'écran d'inscription conserve
 * sa saisie pendant l'ouverture de cette modale.
 */
export default function DischargeScreen() {
  const t = useT();
  const router = useRouter();
  const setAccepted = useDischargeStore((state) => state.setAccepted);

  const accept = () => {
    setAccepted(true);
    router.back();
  };

  const decline = () => {
    setAccepted(false);
    router.back();
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>{t('decharge.intro')}</Text>

        {CLAUSES.map((numero) => (
          <View key={numero} style={styles.clause}>
            <Text style={styles.clauseTitle}>
              {numero}. {t(`decharge.c${numero}.titre` as Cle)}
            </Text>
            <Text style={styles.clauseBody}>{t(`decharge.c${numero}.corps` as Cle)}</Text>
          </View>
        ))}

        <Text style={styles.legal}>{t('decharge.legal')}</Text>

        {/*
          Le texte est écrit au regard du droit français. Le dire vaut mieux que
          le laisser croire : ailleurs, il informe sans engager, et le droit
          local prévaut de toute façon sur une renonciation contractuelle.
        */}
        <Text style={styles.legal}>{t('decharge.droitLocal')}</Text>
      </ScrollView>

      <View style={styles.actions}>
        <Button label={t('decharge.accepter')} onPress={accept} testID="discharge-accept" />
        <Button label={t('decharge.refuser')} onPress={decline} variant="ghost" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: COLORS.background, flex: 1 },
  content: { padding: SPACING.xl, paddingBottom: SPACING.xxl },
  intro: { ...TYPOGRAPHY.body, color: COLORS.textMuted, marginBottom: SPACING.xl },
  clause: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.md,
    padding: SPACING.lg,
  },
  clauseTitle: { ...TYPOGRAPHY.subtitle, color: COLORS.text, marginBottom: SPACING.xs },
  clauseBody: { ...TYPOGRAPHY.body, color: COLORS.text, lineHeight: 20 },
  legal: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: SPACING.md },
  actions: {
    backgroundColor: COLORS.surface,
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    gap: SPACING.sm,
    padding: SPACING.lg,
  },
});
