import React, { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { useToast } from 'react-native-toast-notifications';

import Button from '@/components/Button';
import Input from '@/components/Input';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useT } from '@/i18n';
import { useAuth } from '@/context/AuthContext';
import { loginSchema, validate, type FieldErrors, type LoginInput } from '@/utils/validation';

export default function LoginScreen() {
  const t = useT();
  const { login, isSubmitting, error, clearError } = useAuth();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors<LoginInput>>({});

  // Les erreurs serveur sont remontées en toast, les erreurs de champ sous l'input.
  useEffect(() => {
    if (!error) return;
    toast.show(error.message, { type: 'danger' });
    if (error.fieldErrors) {
      setErrors((previous) => ({ ...previous, ...(error.fieldErrors as FieldErrors<LoginInput>) }));
    }
    clearError();
  }, [clearError, error, toast]);

  const handleSubmit = useCallback(async () => {
    const result = validate(loginSchema, { email, password });
    setErrors(result.errors);
    if (!result.success || !result.data) return;

    const success = await login(result.data);
    if (success) {
      toast.show(t('connexion.reussie'), { type: 'success' });
    }
  }, [email, login, password, t, toast]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.logo}>
            Fight<Text style={styles.logoAccent}>Connect</Text>
          </Text>
          <Text style={styles.tagline}>Trouvez votre prochain partenaire de sparring.</Text>
        </View>

        <Input
          label={t('inscription.email')}
          value={email}
          onChangeText={setEmail}
          error={errors.email}
          placeholder="vous@exemple.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          testID="login-email"
        />

        <Input
          label={t('connexion.motDePasse')}
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          placeholder={t('connexion.motDePassePlaceholder')}
          secure
          autoCapitalize="none"
          autoComplete="password"
          textContentType="password"
          testID="login-password"
        />

        <Button
          label={t('connexion.titre')}
          onPress={handleSubmit}
          loading={isSubmitting}
          testID="login-submit"
        />

        <View style={styles.footer}>
          <Text style={styles.footerText}>Pas encore de compte ?</Text>
          <Link href="/(auth)/signup" style={styles.link}>
            Créer un compte
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: COLORS.background, flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: SPACING.xl },
  header: { marginBottom: SPACING.xxl },
  logo: { ...TYPOGRAPHY.display, color: COLORS.text, fontSize: 34 },
  logoAccent: { color: COLORS.primary },
  tagline: { ...TYPOGRAPHY.body, color: COLORS.textMuted, marginTop: SPACING.sm },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.xs,
    justifyContent: 'center',
    marginTop: SPACING.xl,
  },
  footerText: { ...TYPOGRAPHY.body, color: COLORS.textMuted },
  link: { ...TYPOGRAPHY.body, color: COLORS.primary, fontWeight: '600' },
});
