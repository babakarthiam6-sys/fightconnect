import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import Button from '@/components/Button';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useDischargeStore } from '@/store/discharge';

const CLAUSES = [
  {
    title: 'Nature de l’activité',
    body:
      'Le sparring est une activité de contact. Elle comporte un risque intrinsèque de blessure, y compris de blessure grave, malgré le respect des règles et le port des protections.',
  },
  {
    title: 'Aptitude physique',
    body:
      'Vous déclarez être en condition physique compatible avec la pratique des sports de combat et ne présenter aucune contre-indication médicale connue.',
  },
  {
    title: 'Équipement',
    body:
      'Vous vous engagez à utiliser un équipement de protection conforme (gants, protège-dents, coquille, protège-tibias selon la discipline) et en bon état.',
  },
  {
    title: 'Rôle de FightConnect',
    body:
      'FightConnect est un intermédiaire de mise en relation. La plateforme n’organise pas les séances, n’encadre pas les pratiquants et n’est pas responsable des dommages survenus pendant une séance.',
  },
  {
    title: 'Assurance',
    body:
      'Il vous appartient de disposer d’une assurance individuelle accident et d’une responsabilité civile couvrant la pratique des sports de combat.',
  },
  {
    title: 'Comportement',
    body:
      'Tout comportement dangereux, sous emprise de substances, ou contraire aux règles de la discipline entraîne la suspension du compte.',
  },
];

/**
 * Décharge de responsabilité, obligatoire avant toute inscription.
 *
 * L'acceptation transite par un store partagé : l'écran d'inscription conserve
 * sa saisie pendant l'ouverture de cette modale.
 */
export default function DischargeScreen() {
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
        <Text style={styles.intro}>
          Lisez attentivement ces conditions. Elles doivent être acceptées pour créer un compte et
          participer à un sparring.
        </Text>

        {CLAUSES.map((clause, index) => (
          <View key={clause.title} style={styles.clause}>
            <Text style={styles.clauseTitle}>
              {index + 1}. {clause.title}
            </Text>
            <Text style={styles.clauseBody}>{clause.body}</Text>
          </View>
        ))}

        <Text style={styles.legal}>
          En acceptant, vous reconnaissez avoir lu et compris l’ensemble de ces clauses et renoncez à
          tout recours contre FightConnect au titre des risques inhérents à la pratique.
        </Text>
      </ScrollView>

      <View style={styles.actions}>
        <Button label="J’accepte" onPress={accept} testID="discharge-accept" />
        <Button label="Refuser" onPress={decline} variant="ghost" />
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
  clauseTitle: { ...TYPOGRAPHY.subtitle, color: COLORS.secondary, marginBottom: SPACING.xs },
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
