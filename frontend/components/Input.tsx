import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useT } from '@/i18n';

interface Props extends Omit<TextInputProps, 'onChangeText' | 'value'> {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  hint?: string;
  secure?: boolean;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  testID?: string;
}

export function Input({
  label,
  value,
  onChangeText,
  error,
  hint,
  secure = false,
  multiline = false,
  testID,
  ...rest
}: Props) {
  const t = useT();
  const [isFocused, setIsFocused] = useState(false);
  const [isHidden, setIsHidden] = useState(secure);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>

      <View
        style={[
          styles.field,
          isFocused && styles.fieldFocused,
          Boolean(error) && styles.fieldError,
          multiline && styles.fieldMultiline,
        ]}
      >
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          secureTextEntry={isHidden}
          multiline={multiline}
          placeholderTextColor={COLORS.textMuted}
          style={[styles.input, multiline && styles.inputMultiline]}
          {...rest}
        />

        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isHidden ? t('general.afficherMotDePasse') : t('general.masquerMotDePasse')
            }
            hitSlop={10}
            onPress={() => setIsHidden((hidden) => !hidden)}
          >
            <Ionicons
              name={isHidden ? 'eye-outline' : 'eye-off-outline'}
              size={20}
              color={COLORS.textMuted}
            />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: SPACING.lg },
  label: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginBottom: SPACING.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  field: {
    alignItems: 'center',
    // Le champ est plus clair que la carte qui le porte : sur fond sombre c'est
    // ce contraste-là, et non un contour, qui signale une zone de saisie.
    backgroundColor: COLORS.surfaceRaised,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    flexDirection: 'row',
    minHeight: 50,
    paddingHorizontal: SPACING.md,
  },
  fieldFocused: { borderColor: COLORS.primary },
  fieldError: { borderColor: COLORS.error },
  fieldMultiline: { alignItems: 'flex-start', minHeight: 110, paddingVertical: SPACING.md },
  input: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    flex: 1,
    paddingVertical: SPACING.md,
  },
  inputMultiline: { paddingVertical: 0, textAlignVertical: 'top' },
  error: { ...TYPOGRAPHY.caption, color: COLORS.error, marginTop: SPACING.xs },
  hint: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: SPACING.xs },
});

export default Input;
