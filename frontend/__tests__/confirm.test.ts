import { Alert, Platform } from 'react-native';

import { confirm } from '@/utils/confirm';

const OPTIONS = { title: 'Supprimer', message: 'Sûr ?', confirmLabel: 'Supprimer' };

type AlertButtons = Parameters<typeof Alert.alert>[2];

describe('confirm', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalOS;
    jest.restoreAllMocks();
  });

  function pressOnNative(label: string) {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons: AlertButtons) => {
      buttons?.find((button) => button.text === label)?.onPress?.();
    });
  }

  it('résout vrai quand on confirme', async () => {
    Platform.OS = 'android';
    pressOnNative('Supprimer');

    await expect(confirm(OPTIONS)).resolves.toBe(true);
  });

  it('résout faux quand on annule', async () => {
    Platform.OS = 'android';
    pressOnNative('Annuler');

    await expect(confirm(OPTIONS)).resolves.toBe(false);
  });

  it('passe par la boîte du navigateur sur le web, où Alert ne fait rien', async () => {
    Platform.OS = 'web';
    const alert = jest.spyOn(Alert, 'alert');
    const browserConfirm = jest.fn().mockReturnValue(true);
    (globalThis as { confirm?: unknown }).confirm = browserConfirm;

    await expect(confirm(OPTIONS)).resolves.toBe(true);
    expect(browserConfirm).toHaveBeenCalledWith('Supprimer\n\nSûr ?');
    expect(alert).not.toHaveBeenCalled();

    delete (globalThis as { confirm?: unknown }).confirm;
  });
});
