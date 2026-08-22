import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';

import { isOnline } from '@/services/api';

const fetchState = NetInfo.fetch as unknown as jest.Mock;

/**
 * Sur le web, NetInfo devine la connectivité avec un `HEAD /` qu'il annule
 * parfois : il annonce alors une coupure qui n'existe pas, et l'écran de
 * recherche sert le cache avec un bandeau « hors ligne » sans avoir appelé
 * l'API. Vérifié en production : environ un chargement sur cinq.
 *
 * Le navigateur, lui, connaît son propre état. C'est lui qui tranche.
 */
describe('isOnline', () => {
  const plateforme = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: plateforme, configurable: true });
    fetchState.mockReset();
  });

  function surLeWeb() {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
  }

  it('ignore la sonde de NetInfo sur le web quand le navigateur se dit en ligne', async () => {
    surLeWeb();
    fetchState.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });

    await expect(isOnline()).resolves.toBe(true);
    expect(fetchState).not.toHaveBeenCalled();
  });

  it('respecte une vraie coupure annoncée par le navigateur', async () => {
    surLeWeb();
    Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true });

    await expect(isOnline()).resolves.toBe(false);
  });

  it('continue de suivre NetInfo sur mobile', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });

    fetchState.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    await expect(isOnline()).resolves.toBe(false);

    fetchState.mockResolvedValue({ isConnected: true, isInternetReachable: null });
    await expect(isOnline()).resolves.toBe(true);
  });
});
