import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS } from '@/constants/api';
import { http, isOnline } from '@/services/api';
import { sparringService } from '@/services/sparring';

jest.mock('@/services/api', () => ({
  http: { get: jest.fn(), post: jest.fn() },
  isOnline: jest.fn(),
}));

const mockedHttp = http as jest.Mocked<typeof http>;
const mockedIsOnline = isOnline as jest.MockedFunction<typeof isOnline>;

const API_SPARRING = {
  _id: 's1',
  title: 'Sparring boxe',
  location: 'Paris',
  price_cents: 2500,
  level: 'advanced',
  style: 'muay_thai',
  max_participants: 4,
  participants: ['u1'],
};

describe('service sparrings', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('met en cache la première page non filtrée', async () => {
    mockedIsOnline.mockResolvedValue(true);
    mockedHttp.get.mockResolvedValue({ items: [API_SPARRING], total: 1 });

    const result = await sparringService.list({ page: 1 });

    expect(result.fromCache).toBe(false);
    expect(result.items[0]?.price).toBe(25);
    expect(await AsyncStorage.getItem(STORAGE_KEYS.sparringsCache)).not.toBeNull();
  });

  it('ne met pas en cache une recherche filtrée', async () => {
    mockedIsOnline.mockResolvedValue(true);
    mockedHttp.get.mockResolvedValue([API_SPARRING]);

    await sparringService.list({ page: 1, filters: { search: 'paris' } });

    expect(await AsyncStorage.getItem(STORAGE_KEYS.sparringsCache)).toBeNull();
  });

  it('sert le cache sans appeler le réseau quand l’appareil est hors ligne', async () => {
    mockedIsOnline.mockResolvedValue(true);
    mockedHttp.get.mockResolvedValue({ items: [API_SPARRING] });
    await sparringService.list({ page: 1 });

    jest.clearAllMocks();
    mockedIsOnline.mockResolvedValue(false);

    const offline = await sparringService.list({ page: 1 });

    expect(mockedHttp.get).not.toHaveBeenCalled();
    expect(offline.fromCache).toBe(true);
    expect(offline.items).toHaveLength(1);
    expect(offline.hasMore).toBe(false);
  });

  it('filtre le cache localement quand on est hors ligne', async () => {
    mockedIsOnline.mockResolvedValue(true);
    mockedHttp.get.mockResolvedValue({
      items: [API_SPARRING, { ...API_SPARRING, _id: 's2', title: 'MMA Lyon', location: 'Lyon' }],
    });
    await sparringService.list({ page: 1 });

    mockedIsOnline.mockResolvedValue(false);
    const filtered = await sparringService.list({ filters: { search: 'lyon' } });

    expect(filtered.items.map((item) => item.id)).toEqual(['s2']);
  });

  it('retombe sur le cache si la requête échoue', async () => {
    mockedIsOnline.mockResolvedValue(true);
    mockedHttp.get.mockResolvedValueOnce({ items: [API_SPARRING] });
    await sparringService.list({ page: 1 });

    mockedHttp.get.mockRejectedValueOnce({ message: 'boom', isNetworkError: false });
    const result = await sparringService.list({ page: 1 });

    expect(result.fromCache).toBe(true);
    expect(result.items).toHaveLength(1);
  });

  it('propage l’erreur quand aucun cache n’est disponible', async () => {
    mockedIsOnline.mockResolvedValue(true);
    mockedHttp.get.mockRejectedValue({ message: 'boom' });

    await expect(sparringService.list({ page: 1 })).rejects.toMatchObject({ message: 'boom' });
  });

  it('envoie le formulaire de création en snake_case', async () => {
    mockedHttp.post.mockResolvedValue(API_SPARRING);

    await sparringService.create({
      title: 'Sparring boxe',
      description: 'Séance technique à intensité modérée.',
      location: 'Paris',
      scheduledAt: '2030-01-01T18:00:00.000Z',
      durationMinutes: 90,
      level: 'advanced',
      style: 'muay_thai',
      price: 25,
      maxParticipants: 4,
    });

    expect(mockedHttp.post).toHaveBeenCalledWith(
      '/sparrings',
      expect.objectContaining({
        duration_minutes: 90,
        max_participants: 4,
        scheduled_at: '2030-01-01T18:00:00.000Z',
      }),
    );
  });

  it('tolère une réponse vide sur `join` (204 sans corps)', async () => {
    mockedHttp.post.mockResolvedValue(undefined);
    await expect(sparringService.join('s1')).resolves.toBeNull();
  });
});

describe('filtre par organisateur', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockedIsOnline.mockResolvedValue(true);
  });

  it('transmet creator_id au serveur', async () => {
    mockedHttp.get.mockResolvedValue({ items: [API_SPARRING] });

    await sparringService.list({ page: 1, creatorId: 'u1' });

    expect(mockedHttp.get).toHaveBeenCalledWith(
      '/sparrings',
      expect.objectContaining({ params: expect.objectContaining({ creator_id: 'u1' }) }),
    );
  });

  it('n’écrase pas le cache général avec une liste restreinte', async () => {
    mockedHttp.get.mockResolvedValue({ items: [API_SPARRING] });

    await sparringService.list({ page: 1, creatorId: 'u1' });

    expect(await AsyncStorage.getItem(STORAGE_KEYS.sparringsCache)).toBeNull();
  });

  it('applique le filtre organisateur au cache hors ligne', async () => {
    mockedHttp.get.mockResolvedValue({
      items: [
        { ...API_SPARRING, _id: 's1', creator: { _id: 'u1', first_name: 'Ada' } },
        { ...API_SPARRING, _id: 's2', creator: { _id: 'u2', first_name: 'Léa' } },
      ],
    });
    await sparringService.list({ page: 1 });

    mockedIsOnline.mockResolvedValue(false);
    const mine = await sparringService.list({ creatorId: 'u1' });

    expect(mine.items.map((item) => item.id)).toEqual(['s1']);
  });
});
