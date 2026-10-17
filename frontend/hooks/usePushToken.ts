import { useEffect } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

import { chatService } from '@/services/chat';

/**
 * Enregistre l'appareil pour les notifications (messages, réponses aux annonces).
 *
 * Sans effet sur le web, qui n'a pas de notifications push Expo — et c'est
 * aujourd'hui la seule façon d'utiliser l'application. Le circuit complet est
 * néanmoins en place, jusqu'au serveur : le jour d'un build iOS ou Android,
 * il n'y a rien de plus à écrire.
 *
 * Aucun échec n'est remonté : ne pas recevoir de notification est un
 * désagrément, empêcher l'ouverture de l'application en serait un autre.
 */
export function usePushToken(isAuthenticated: boolean): void {
  useEffect(() => {
    if (!isAuthenticated || Platform.OS === 'web') return;

    let annule = false;

    void (async () => {
      try {
        // Android 13 et plus n'affiche pas la demande d'autorisation tant que
        // l'application n'a créé aucun canal : sans celui-ci, personne ne
        // recevrait jamais de notification sur un téléphone récent.
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Messages et annonces',
            importance: Notifications.AndroidImportance.HIGH,
          });
        }

        const existant = await Notifications.getPermissionsAsync();
        const accord = existant.granted ? existant : await Notifications.requestPermissionsAsync();

        // Un refus n'est pas une erreur : on n'insiste pas et on n'enregistre rien.
        if (!accord.granted || annule) return;

        // Recommandé par Expo même dans un build EAS, qui sait le retrouver seul.
        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
        const { data } = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );
        if (!annule) await chatService.registerPushToken(data);
      } catch {
        // Simulateur sans services push, ou service indisponible : sans effet.
      }
    })();

    return () => {
      annule = true;
    };
  }, [isAuthenticated]);
}
