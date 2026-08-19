import { AxiosError, AxiosHeaders } from 'axios';

import { CONFIG } from '@/constants/config';
import { api, http, setAuthToken, toAppError } from '@/services/api';

function axiosErrorWithResponse(status: number, data: unknown): AxiosError {
  const error = new AxiosError('Request failed');
  error.response = {
    status,
    data,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
  return error;
}

function networkError(code = 'ERR_NETWORK'): AxiosError {
  const error = new AxiosError('Network Error');
  error.code = code;
  return error;
}

describe('normalisation des erreurs', () => {
  it('distingue une panne réseau d’une erreur serveur', () => {
    const offline = toAppError(networkError());
    expect(offline.isNetworkError).toBe(true);
    expect(offline.status).toBeNull();

    const timeout = toAppError(networkError('ECONNABORTED'));
    expect(timeout.isNetworkError).toBe(true);
    expect(timeout.message).toMatch(/trop de temps/i);
  });

  it('remonte le champ `detail` de FastAPI', () => {
    const error = toAppError(axiosErrorWithResponse(400, { detail: 'Email déjà utilisé' }));
    expect(error.message).toBe('Email déjà utilisé');
    expect(error.status).toBe(400);
  });

  it('extrait les erreurs de champ d’une 422 FastAPI', () => {
    const error = toAppError(
      axiosErrorWithResponse(422, {
        detail: [
          { loc: ['body', 'email'], msg: 'value is not a valid email address' },
          { loc: ['body', 'password'], msg: 'too short' },
        ],
      }),
    );

    expect(error.fieldErrors).toEqual({
      email: 'value is not a valid email address',
      password: 'too short',
    });
  });

  it('fournit un message par défaut selon le statut', () => {
    expect(toAppError(axiosErrorWithResponse(401, {})).message).toMatch(/session expirée/i);
    expect(toAppError(axiosErrorWithResponse(404, {})).message).toMatch(/introuvable/i);
    expect(toAppError(axiosErrorWithResponse(503, {})).message).toMatch(/serveur/i);
  });

  it('accepte une erreur non-axios', () => {
    const error = toAppError(new Error('boom'));
    expect(error.message).toBe('boom');
    expect(error.isNetworkError).toBe(false);
  });
});

describe('politique de réessai', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    setAuthToken(null);
  });

  it('réessaie un GET en panne réseau puis abandonne', async () => {
    const spy = jest.spyOn(api, 'request').mockRejectedValue(networkError());

    await expect(http.get('/sparrings')).rejects.toMatchObject({ isNetworkError: true });
    expect(spy).toHaveBeenCalledTimes(CONFIG.maxRetries + 1);
  });

  it('ne rejoue jamais un POST : un paiement ne doit pas partir deux fois', async () => {
    const spy = jest.spyOn(api, 'request').mockRejectedValue(networkError());

    await expect(http.post('/payments/create-intent', {})).rejects.toMatchObject({
      isNetworkError: true,
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('ne rejoue pas une erreur 4xx, même sur un GET', async () => {
    const spy = jest.spyOn(api, 'request').mockRejectedValue(axiosErrorWithResponse(404, {}));

    await expect(http.get('/sparrings/inconnu')).rejects.toMatchObject({ status: 404 });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('renvoie les données au premier succès', async () => {
    jest.spyOn(api, 'request').mockResolvedValue({ data: { ok: true } });
    await expect(http.get('/sparrings')).resolves.toEqual({ ok: true });
  });
});
