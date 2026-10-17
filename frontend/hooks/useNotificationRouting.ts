import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';

import { notificationRoute } from '@/utils/notifications';

// Sans gestionnaire, une notification reçue pendant que l'application est
// ouverte n'est pas affichée du tout. Une réponse à une annonce arrive pourtant
// souvent à ce moment-là.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Ouvre l'écran d'une notification touchée : la conversation pour un message,
 * l'annonce pour une réponse.
 *
 * Couvre les deux cas : application déjà ouverte (écouteur) et application
 * lancée par le toucher (dernière réponse enregistrée). Rien ne se passe tant
 * que la session n'est pas restaurée : l'écran visé l'exige.
 */
export function useNotificationRouting(myId: string | null | undefined, ready: boolean): void {
  const router = useRouter();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web' || !ready || !myId) return;

    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER)
        return;
      // Le même toucher peut revenir par les deux chemins : on ne l'ouvre qu'une fois.
      const key = response.notification.request.identifier;
      if (handled.current === key) return;
      handled.current = key;

      const route = notificationRoute(response.notification.request.content.data, myId);
      if (route) router.push(route);
    };

    void Notifications.getLastNotificationResponseAsync()
      .then(open)
      .catch(() => undefined);
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [myId, ready, router]);
}
