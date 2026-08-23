import React from 'react';
import { Stack } from 'expo-router';

import { COLORS } from '@/constants/theme';
import { useT } from '@/i18n';

export default function AuthLayout() {
  const t = useT();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background },
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="discharge" options={{ presentation: 'modal', headerShown: true, title: t('decharge.titre') }} />
    </Stack>
  );
}
