import React from 'react';
import { Redirect } from 'expo-router';

import { useAuth } from '@/context/AuthContext';

/** Point d'entrée : aiguille vers les onglets ou l'écran de connexion. */
export default function Index() {
  const { isAuthenticated } = useAuth();
  return <Redirect href={isAuthenticated ? '/(tabs)/home' : '/(auth)/login'} />;
}
