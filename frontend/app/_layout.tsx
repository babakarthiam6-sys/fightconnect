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
import { usePushToken } from '@/hooks/usePushToken';
import { AppProvider } from '@/context/AppContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { COLORS } from '@/constants/theme';
import { I18nProvider, useT } from '@/i18n';
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
      router.replace('/(auth)/welcome');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)/search');
    }
  }, [isAuthenticated, isBootstrapping, router, segments]);
}

function RootNavigator() {
  const t = useT();
  const { isAuthenticated, isBootstrapping } = useAuth();
  useAuthRedirect();
  usePushToken(isAuthenticated);

  useEffect(() => {
    if (!isBootstrapping) {
      void SplashScreen.hideAsync();
    }
  }, [isBootstrapping]);

  if (isBootstrapping) {
    return (
      <View style={styles.bootstrap}>
        <LoadingSpinner fullScreen label={t('general.chargementCompte')} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.background },
        headerTintColor: COLORS.text,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: COLORS.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="partner/[id]" options={{ title: t('partenaire.titre') }} />
      <Stack.Screen
        name="booking/[id]"
        options={{ title: t('reservation.titre'), presentation: 'card' }}
      />
      <Stack.Screen
        name="booking/pay/[id]"
        options={{ title: 'Paiement', presentation: 'card' }}
      />
      <Stack.Screen name="payments" options={{ title: t('paiement.titre') }} />
      <Stack.Screen
        name="compte/supprimer"
        options={{ title: t('suppression.titre'), presentation: 'card' }}
      />
      <Stack.Screen name="chat/index" options={{ title: t('discussion.titre') }} />
      <Stack.Screen name="chat/[id]" options={{ title: 'Conversation' }} />
    </Stack>
  );
}

function Providers({ children }: { children: React.ReactNode }) {
  // StripeProvider n'est monté que si une clé publique est disponible : sans
  // clé, le SDK lève une exception au montage et bloquerait toute l'app.
  // La langue enveloppe tout le reste : l'écran de connexion, les messages
  // d'erreur du réseau et les libellés de navigation en dépendent déjà.
  const content = (
    <I18nProvider>
      <AuthProvider>
        <AppProvider>{children}</AppProvider>
      </AuthProvider>
    </I18nProvider>
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
          // Assez bas pour ne pas masquer le sélecteur « Reçues / Envoyées »,
          // qui se trouve juste sous le titre des écrans.
          offsetTop={110}
          duration={3000}
          animationType="slide-in"
          successColor={COLORS.success}
          dangerColor={COLORS.error}
          warningColor={COLORS.warning}
        >
          <Providers>
            <StatusBar style="light" />
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
