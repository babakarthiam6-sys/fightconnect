import React from 'react';
import { Stack } from 'expo-router';

import { COLORS } from '@/constants/theme';

export default function AuthLayout() {
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
      <Stack.Screen name="discharge" options={{ presentation: 'modal', headerShown: true, title: 'Décharge de responsabilité' }} />
    </Stack>
  );
}
