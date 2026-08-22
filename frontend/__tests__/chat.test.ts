import { socketUrl } from '@/hooks/useChatSocket';
import { chatService } from '@/services/chat';
import { http } from '@/services/api';
import { normalizeConversation, normalizeMessage } from '@/utils/normalize';

jest.mock('@/services/api', () => ({
  http: { get: jest.fn(), put: jest.fn() },
  getAuthToken: jest.fn(() => 'jeton'),
}));

const mockedHttp = http as jest.Mocked<typeof http>;

beforeEach(() => jest.clearAllMocks());

describe('adresse du WebSocket', () => {
  it('passe de https à wss', () => {
    expect(socketUrl('https://exemple.test/api/v1', 'abc')).toBe(
      'wss://exemple.test/api/v1/chat/ws?token=abc',
    );
  });

  it('passe de http à ws, pour le développement local', () => {
    expect(socketUrl('http://127.0.0.1:8000/api/v1', 'abc')).toBe(
      'ws://127.0.0.1:8000/api/v1/chat/ws?token=abc',
    );
  });

  it('échappe le jeton, qui contient des points et des tirets', () => {
    // Un JWT non échappé casserait la requête dès qu'il contient un « + » ou un « / ».
    const jwt = 'aa.bb+cc/dd=';
    expect(socketUrl('https://exemple.test/api/v1', jwt)).toContain(
      `token=${encodeURIComponent(jwt)}`,
    );
  });

  /** Chaque cas pose explicitement l'origine : l'ordre des tests ne doit rien changer. */
  function withOrigin(origin: string | undefined, run: () => void): void {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: origin === undefined ? {} : { location: { origin } },
    });
    try {
      run();
    } finally {
      if (previous) Object.defineProperty(globalThis, 'window', previous);
    }
  }

  it('résout une adresse relative contre l’origine de la page', () => {
    // L'export web vise « /api/v1 » : sans résolution, l'adresse serait invalide.
    withOrigin('https://exemple.test', () => {
      expect(socketUrl('/api/v1', 'abc')).toBe('wss://exemple.test/api/v1/chat/ws?token=abc');
    });
  });

  it('renonce plutôt que de former une adresse invalide', () => {
    // Cas d'un build natif configuré avec « /api/v1 » : il n'y a pas d'origine
    // de page. Mieux vaut ne pas ouvrir de fil que de lever au montage.
    withOrigin(undefined, () => {
      expect(socketUrl('/api/v1', 'abc')).toBe('');
    });
  });
});

describe('normalisation des échanges', () => {
  it('lit un message du serveur', () => {
    const message = normalizeMessage({
      id: 'm1',
      conversation_id: 'a-b',
      sender_id: 'a',
      recipient_id: 'b',
      author: { id: 'a', first_name: 'Ana', last_name: 'Martin' },
      content: 'Dispo samedi ?',
      read: false,
      created_at: '2026-08-21T18:30:00+00:00',
    });

    expect(message.conversationId).toBe('a-b');
    expect(message.senderId).toBe('a');
    expect(message.author?.firstName).toBe('Ana');
    expect(message.content).toBe('Dispo samedi ?');
    expect(message.read).toBe(false);
  });

  it('lit une conversation avec son compteur de non-lus', () => {
    const conversation = normalizeConversation({
      id: 'a-b',
      other: { id: 'b', first_name: 'Luis', last_name: 'Dupont' },
      last_message: 'À samedi',
      last_message_at: '2026-08-21T18:30:00+00:00',
      unread: 3,
    });

    expect(conversation.other?.firstName).toBe('Luis');
    expect(conversation.lastMessage).toBe('À samedi');
    expect(conversation.unread).toBe(3);
  });
});

describe('service de discussion', () => {
  it('demande l’historique de la bonne personne', async () => {
    mockedHttp.get.mockResolvedValue({ items: [] });

    await chatService.history('p1');

    expect(mockedHttp.get).toHaveBeenCalledWith('/chat/history/p1');
  });

  it('enregistre le jeton d’appareil', async () => {
    mockedHttp.put.mockResolvedValue({});

    await chatService.registerPushToken('ExponentPushToken[abc]');

    expect(mockedHttp.put).toHaveBeenCalledWith('/chat/push-token', {
      expo_push_token: 'ExponentPushToken[abc]',
    });
  });

  it('avale l’échec d’enregistrement du jeton', async () => {
    // Ne pas recevoir de notification est un désagrément ; empêcher l'ouverture
    // de l'application en serait un autre.
    mockedHttp.put.mockRejectedValue(new Error('réseau'));

    await expect(chatService.registerPushToken('ExponentPushToken[abc]')).resolves.toBeUndefined();
  });
});
