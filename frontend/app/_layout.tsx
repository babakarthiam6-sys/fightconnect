import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StripeProvider } from '@stripe/stripe-react-native';
import { ToastProvider } from 'react-native-toast-notifications';

import LoadingSpinner from '@/components/LoadingSpinner';
import { AppProvider } from '@/context/AppContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { COLORS } from '@/constants/theme';
import { IS_STRIPE_CONFIGURED, STRIPE_MERCHANT_ID, STRIPE_PUBLISHABLE_KEY } from '@/constants/config';

// Le splash reste visible tant que la session n'est pas restaurée.
void SplashScreen.preventAutoHideAsync();

/**
 * Redirige selon l'état d'authentification.
 *
 * Tant que `isBootstrapping` est vrai on ne navigue pas : rediriger avant la fin
 * de la restauration ferait clignoter l'écran de login à chaque démarrage.
 */
function useAuthRedirect() {
  const { isAuthenticated, isBootstrapping } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isBootstrapping) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)/home');
    }
  }, [isAuthenticated, isBootstrapping, router, segments]);
}

function RootNavigator() {
  const { isBootstrapping } = useAuth();
  useAuthRedirect();

  useEffect(() => {
    if (!isBootstrapping) {
      void SplashScreen.hideAsync();
    }
  }, [isBootstrapping]);

  if (isBootstrapping) {
    return (
      <View style={styles.bootstrap}>
        <LoadingSpinner fullScreen label="Connexion à votre compte…" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.surface },
        headerTintColor: COLORS.secondary,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: COLORS.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="sparring/[id]"
        options={{ title: 'Détail du sparring', presentation: 'card' }}
      />
      <Stack.Screen
        name="sparring/create"
        options={{ title: 'Nouveau sparring', presentation: 'modal' }}
      />
    </Stack>
  );
}

function Providers({ children }: { children: React.ReactNode }) {
  // StripeProvider n'est monté que si une clé publique est disponible : sans
  // clé, le SDK lève une exception au montage et bloquerait toute l'app.
  const content = (
    <AuthProvider>
      <AppProvider>{children}</AppProvider>
    </AuthProvider>
  );

  if (!IS_STRIPE_CONFIGURED) return content;

  return (
    <StripeProvider
      publishableKey={STRIPE_PUBLISHABLE_KEY}
      merchantIdentifier={STRIPE_MERCHANT_ID}
      urlScheme="fightconnect"
    >
      {content}
    </StripeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ToastProvider
          placement="top"
          offsetTop={60}
          duration={3000}
          animationType="slide-in"
          successColor={COLORS.success}
          dangerColor={COLORS.error}
          warningColor={COLORS.warning}
        >
          <Providers>
            <StatusBar style="dark" />
            <RootNavigator />
          </Providers>
        </ToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bootstrap: { backgroundColor: COLORS.background, flex: 1 },
});
