import React, { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { useToast } from 'react-native-toast-notifications';

import Button from '@/components/Button';
import Input from '@/components/Input';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useT } from '@/i18n';
import { useAuth } from '@/context/AuthContext';
import { useDischargeStore } from '@/store/discharge';
import {
  passwordStrength,
  signupSchema,
  validate,
  type FieldErrors,
  type SignupInput,
} from '@/utils/validation';

const STRENGTH_COLORS = [COLORS.error, COLORS.warning, COLORS.accent, COLORS.success];

export default function SignupScreen() {
  const t = useT();
  const { signup, isSubmitting, error, clearError } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const dischargeAccepted = useDischargeStore((state) => state.accepted);
  const setDischargeAccepted = useDischargeStore((state) => state.setAccepted);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors<SignupInput>>({});

  useEffect(() => {
    if (!error) return;
    toast.show(error.message, { type: 'danger' });
    if (error.fieldErrors) {
      // FastAPI nomme les champs en snake_case : on les remappe sur le formulaire.
      const mapped: FieldErrors<SignupInput> = {};
      for (const [key, message] of Object.entries(error.fieldErrors)) {
        if (key === 'first_name') mapped.firstName = message;
        else if (key === 'last_name') mapped.lastName = message;
        else if (key === 'email') mapped.email = message;
        else if (key === 'password') mapped.password = message;
      }
      setErrors((previous) => ({ ...previous, ...mapped }));
    }
    clearError();
  }, [clearError, error, toast]);

  const strength = passwordStrength(password);

  const handleSubmit = useCallback(async () => {
    const result = validate(signupSchema, {
      firstName,
      lastName,
      email,
      password,
      dischargeAccepted,
    }, t as never);
    setErrors(result.errors);
    if (!result.success || !result.data) return;

    const success = await signup(result.data);
    if (success) {
      toast.show(t('inscription.bienvenue'), { type: 'success' });
    }
  }, [t, dischargeAccepted, email, firstName, lastName, password, signup, toast]);

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
        <Text style={styles.title}>{t('accueil.creer')}</Text>
        <Text style={styles.subtitle}>{t('inscription.sousTitre')}</Text>

        <View style={styles.row}>
          <View style={styles.rowItem}>
            <Input
              label={t('inscription.prenom')}
              value={firstName}
              onChangeText={setFirstName}
              error={errors.firstName}
              placeholder="Jean"
              autoComplete="given-name"
              testID="signup-firstname"
            />
          </View>
          <View style={styles.rowItem}>
            <Input
              label={t('inscription.nom')}
              value={lastName}
              onChangeText={setLastName}
              error={errors.lastName}
              placeholder="Dupont"
              autoComplete="family-name"
              testID="signup-lastname"
            />
          </View>
        </View>

        <Input
          label={t('inscription.email')}
          value={email}
          onChangeText={setEmail}
          error={errors.email}
          placeholder={t('inscription.emailExemple')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          testID="signup-email"
        />

        <Input
          label={t('inscription.motDePasse')}
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          hint={t('inscription.indiceMotDePasse')}
          placeholder="••••••••"
          secure
          autoCapitalize="none"
          autoComplete="password-new"
          testID="signup-password"
        />

        {password.length > 0 ? (
          <View style={styles.strengthRow}>
            <View style={styles.strengthTrack}>
              <View
                style={[
                  styles.strengthFill,
                  {
                    width: `${((strength.score + 1) / 4) * 100}%`,
                    backgroundColor: STRENGTH_COLORS[strength.score],
                  },
                ]}
              />
            </View>
            <Text style={[styles.strengthLabel, { color: STRENGTH_COLORS[strength.score] }]}>
              {t(strength.label)}
            </Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: dischargeAccepted }}
          onPress={() => setDischargeAccepted(!dischargeAccepted)}
          style={styles.checkboxRow}
        >
          <View style={[styles.checkbox, dischargeAccepted && styles.checkboxChecked]}>
            {dischargeAccepted ? (
              <Ionicons name="checkmark" size={16} color={COLORS.textInverse} />
            ) : null}
          </View>
          <Text style={styles.checkboxLabel}>
            {t('inscription.jAccepteLa')}
            <Text
              style={styles.link}
              onPress={() => router.push('/(auth)/discharge')}
              suppressHighlighting
            >
              {t('inscription.decharge')}
            </Text>
          </Text>
        </Pressable>
        {errors.dischargeAccepted ? (
          <Text style={styles.error}>{errors.dischargeAccepted}</Text>
        ) : null}

        <Button
          label={t('inscription.titre')}
          onPress={handleSubmit}
          loading={isSubmitting}
          style={styles.submit}
          testID="signup-submit"
        />

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('inscription.dejaUnCompte')}</Text>
          <Link href="/(auth)/login" style={styles.link}>
            {t('connexion.titre')}
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: COLORS.background, flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: SPACING.xl },
  title: { ...TYPOGRAPHY.display, color: COLORS.text },
  subtitle: { ...TYPOGRAPHY.body, color: COLORS.textMuted, marginBottom: SPACING.xl, marginTop: SPACING.xs },
  row: { flexDirection: 'row', gap: SPACING.md },
  rowItem: { flex: 1 },
  strengthRow: { alignItems: 'center', flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg, marginTop: -SPACING.sm },
  strengthTrack: {
    backgroundColor: COLORS.border,
    borderRadius: RADIUS.pill,
    flex: 1,
    height: 4,
    overflow: 'hidden',
  },
  strengthFill: { borderRadius: RADIUS.pill, height: 4 },
  strengthLabel: { ...TYPOGRAPHY.caption, fontWeight: '600' },
  checkboxRow: { alignItems: 'flex-start', flexDirection: 'row', gap: SPACING.md },
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
  checkboxLabel: { ...TYPOGRAPHY.body, color: COLORS.text, flex: 1 },
  link: { color: COLORS.primary, fontWeight: '600' },
  error: { ...TYPOGRAPHY.caption, color: COLORS.error, marginTop: SPACING.sm },
  submit: { marginTop: SPACING.xl },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.xs,
    justifyContent: 'center',
    marginTop: SPACING.xl,
  },
  footerText: { ...TYPOGRAPHY.body, color: COLORS.textMuted },
});
