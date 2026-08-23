import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import Button from '@/components/Button';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useT } from '@/i18n';

/**
 * Trois promesses, pas plus.
 *
 * C'est le premier écran d'un visiteur qui ne connaît pas encore l'application :
 * il doit comprendre à quoi elle sert avant qu'on lui demande son adresse email.
 */
const FEATURES = [
  { icon: 'search', cle: 'accueil.argument.recherche' },
  { icon: 'calendar', cle: 'accueil.argument.reservation' },
  { icon: 'star', cle: 'accueil.argument.reputation' },
] as const;

export default function WelcomeScreen() {
  const t = useT();
  const router = useRouter();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.emblem}>
          <Ionicons name="pulse" size={40} color={COLORS.primary} />
        </View>

        <Text style={styles.logo}>
          Fight<Text style={styles.logoAccent}>Connect</Text>
        </Text>
        <Text style={styles.tagline}>{t('accueil.tagline')}</Text>
      </View>

      <View style={styles.features}>
        {FEATURES.map((feature) => (
          <View key={feature.icon} style={styles.feature}>
            <Ionicons name={feature.icon} size={22} color={COLORS.primary} />
            <Text style={styles.featureText}>{t(feature.cle)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <Button
          label={t('accueil.creer')}
          onPress={() => router.push('/(auth)/signup')}
          testID="welcome-signup"
        />
        <Button
          label={t('accueil.connexion')}
          variant="outline"
          onPress={() => router.push('/(auth)/login')}
          testID="welcome-login"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: COLORS.background, flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: SPACING.xl },
  header: { alignItems: 'center', marginBottom: SPACING.xxl },
  emblem: {
    alignItems: 'center',
    backgroundColor: COLORS.primarySoft,
    borderRadius: RADIUS.pill,
    height: 96,
    justifyContent: 'center',
    marginBottom: SPACING.xl,
    width: 96,
  },
  logo: { ...TYPOGRAPHY.display, color: COLORS.text, fontSize: 36 },
  logoAccent: { color: COLORS.primary },
  tagline: {
    ...TYPOGRAPHY.subtitle,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  features: { gap: SPACING.md, marginBottom: SPACING.xxl },
  feature: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACING.md,
    padding: SPACING.lg,
  },
  featureText: { ...TYPOGRAPHY.body, color: COLORS.text, flex: 1, fontSize: 15 },
  actions: { gap: SPACING.md },
});
