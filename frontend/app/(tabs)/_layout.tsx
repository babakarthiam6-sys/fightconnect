import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/theme';

/** Hauteur utile de la barre, hors zone système : icône, libellé et marges. */
const TAB_BAR_CONTENT_HEIGHT = 58;

export default function TabsLayout() {
  // Depuis le SDK 54, l'app s'affiche bord à bord sur Android (imposé par
  // Android 16) : la barre de navigation du système se superpose au bas de
  // l'écran. Une hauteur fixe placerait les onglets dessous. On réserve donc la
  // zone système en plus, comme React Navigation le fait quand on ne fixe rien.
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // React Navigation 7 a remplacé la prop `sceneContainerStyle` du
        // navigateur par cette option d'écran.
        sceneStyle: { backgroundColor: COLORS.background },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
          paddingBottom: 4 + insets.bottom,
          paddingTop: 4,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="search"
        options={{
          title: 'Recherche',
          tabBarIcon: ({ color, size }) => <Ionicons name="search" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: 'Réservations',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
