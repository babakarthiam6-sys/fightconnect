import { partnerService } from '@/services/partner';
import { bookingService } from '@/services/booking';
import { http, isOnline } from '@/services/api';
import { cache } from '@/utils/cache';
import { STORAGE_KEYS } from '@/constants/api';
import type { Partner } from '@/types';

jest.mock('@/services/api', () => ({
  http: { get: jest.fn(), post: jest.fn() },
  isOnline: jest.fn(),
}));

jest.mock('@/utils/cache', () => ({
  cache: { read: jest.fn(), write: jest.fn() },
}));

const mockedHttp = http as jest.Mocked<typeof http>;
const mockedIsOnline = isOnline as jest.MockedFunction<typeof isOnline>;
const mockedCache = cache as jest.Mocked<typeof cache>;

function partnerPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    first_name: 'Luis',
    last_name: 'Dupont',
    city: 'Valence',
    country: 'FR',
    style: 'boxing',
    level: 'amateur',
    weight_class: 'middleweight',
    price_per_round: 20,
    available: true,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedIsOnline.mockResolvedValue(true);
  mockedCache.read.mockResolvedValue(null);
});

describe('recherche de partenaires', () => {
  it('traduit les filtres en paramètres attendus par le serveur', async () => {
    mockedHttp.get.mockResolvedValue({ items: [], total: 0 });

    await partnerService.list({
      filters: {
        city: '  Lyon  ',
        country: 'FR',
        style: 'mma',
        level: 'pro',
        weightClass: 'lightweight',
      },
    });

    const config = mockedHttp.get.mock.calls[0]?.[1];
    expect(config?.params).toMatchObject({
      city: 'Lyon',
      country: 'FR',
      style: 'mma',
      level: 'pro',
      weight_class: 'lightweight',
    });
  });

  it('n’envoie pas de filtre vide', async () => {
    mockedHttp.get.mockResolvedValue({ items: [], total: 0 });

    await partnerService.list({ filters: { city: '   ' } });

    const config = mockedHttp.get.mock.calls[0]?.[1];
    expect(config?.params).not.toHaveProperty('city');
  });

  it('met en cache la première page, mais jamais une liste filtrée', async () => {
    mockedHttp.get.mockResolvedValue({ items: [partnerPayload()], total: 1 });

    await partnerService.list({ page: 1 });
    expect(mockedCache.write).toHaveBeenCalledWith(STORAGE_KEYS.partnersCache, expect.any(Array));

    mockedCache.write.mockClear();

    // Une liste filtrée est un sous-ensemble : la mettre en cache priverait le
    // mode hors ligne des partenaires qu'elle a écartés.
    await partnerService.list({ page: 1, filters: { style: 'mma' } });
    expect(mockedCache.write).not.toHaveBeenCalled();
  });

  it('sert le cache hors ligne, en y réappliquant les filtres', async () => {
    mockedIsOnline.mockResolvedValue(false);
    mockedCache.read.mockResolvedValue({
      payload: [
        { ...partnerPayload(), style: 'boxing', city: 'Valence' },
        { ...partnerPayload(), id: 'p2', style: 'mma', city: 'Lyon' },
      ].map((item) => ({
        id: item.id,
        firstName: item.first_name,
        lastName: item.last_name,
        avatarUrl: null,
        averageRating: null,
        ratingsCount: 0,
        city: item.city,
        bio: null,
        style: item.style,
        level: 'amateur',
        weightClass: 'middleweight',
        heightCm: null,
        fightsCount: 0,
        experienceYears: 0,
        pricePerRound: 20,
        currency: 'EUR',
        available: true,
      })) as Partner[],
      savedAt: Date.now(),
      isStale: false,
    });

    const result = await partnerService.list({ filters: { style: 'mma' } });

    expect(mockedHttp.get).not.toHaveBeenCalled();
    expect(result.fromCache).toBe(true);
    expect(result.items.map((item) => item.id)).toEqual(['p2']);
  });

  it('retombe sur le cache quand la requête échoue', async () => {
    mockedHttp.get.mockRejectedValue(new Error('réseau'));
    mockedCache.read.mockResolvedValue({
      payload: [{ id: 'p9', firstName: 'Ana' } as Partner],
      savedAt: Date.now(),
      isStale: false,
    });

    const result = await partnerService.list();

    expect(result.fromCache).toBe(true);
    expect(result.items[0]?.id).toBe('p9');
  });

  it('propage l’erreur si le cache est vide lui aussi', async () => {
    mockedHttp.get.mockRejectedValue(new Error('réseau'));

    await expect(partnerService.list()).rejects.toThrow('réseau');
  });
});

describe('demandes de sparring', () => {
  it('envoie le corps attendu par le serveur', async () => {
    mockedHttp.post.mockResolvedValue({ id: 'b1', rounds: 2 });

    await bookingService.create({
      partnerId: 'p1',
      scheduledAt: '2030-05-12T18:30:00.000Z',
      rounds: 2,
    });

    expect(mockedHttp.post).toHaveBeenCalledWith('/bookings', {
      partner_id: 'p1',
      scheduled_at: '2030-05-12T18:30:00.000Z',
      rounds: 2,
    });
  });

  it('demande explicitement le sens de la liste', async () => {
    mockedHttp.get.mockResolvedValue({ items: [] });

    await bookingService.list('received');

    expect(mockedHttp.get).toHaveBeenCalledWith('/bookings', {
      params: { direction: 'received' },
    });
  });

  it('normalise la demande renvoyée par une transition', async () => {
    mockedHttp.post.mockResolvedValue({ id: 'b1', status: 'accepted', total: 40 });

    const booking = await bookingService.accept('b1');

    expect(mockedHttp.post).toHaveBeenCalledWith('/bookings/b1/accept');
    expect(booking.status).toBe('accepted');
    expect(booking.total).toBe(40);
  });
});
