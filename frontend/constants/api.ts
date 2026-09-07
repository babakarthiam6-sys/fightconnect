/**
 * Chemins de l'API, relatifs à `API_BASE_URL`.
 *
 * Centralisés ici pour qu'un changement de route côté FastAPI ne se répercute
 * que sur un seul fichier.
 */
export const ENDPOINTS = {
  auth: {
    signup: '/auth/signup',
    login: '/auth/login',
    me: '/auth/me',
    updateMe: '/auth/me',
  },
  partners: {
    list: '/partners',
    detail: (id: string) => `/partners/${id}`,
  },
  bookings: {
    list: '/bookings',
    create: '/bookings',
    accept: (id: string) => `/bookings/${id}/accept`,
    decline: (id: string) => `/bookings/${id}/decline`,
    cancel: (id: string) => `/bookings/${id}/cancel`,
    complete: (id: string) => `/bookings/${id}/complete`,
    reviews: (id: string) => `/bookings/${id}/reviews`,
  },
  chat: {
    conversations: '/chat/conversations',
    history: (otherId: string) => `/chat/history/${otherId}`,
    pushToken: '/chat/push-token',
    /** Le jeton passe en paramètre : un WebSocket n'accepte pas d'en-tête. */
    socket: (token: string) => `/chat/ws?token=${encodeURIComponent(token)}`,
  },
  payments: {
    createIntent: '/payments/create-intent',
    history: '/payments/history',
  },
  revenue: {
    stats: '/revenue/stats',
  },
  payouts: {
    status: '/payouts/status',
    onboarding: '/payouts/onboarding',
  },
  videos: {
    add: '/videos',
    remove: (id: string) => `/videos/${id}`,
    order: '/videos/order',
  },
  moderation: {
    reviews: '/moderation/reviews',
    userRisk: (userId: string) => `/moderation/user-risk/${userId}`,
    recommendations: '/moderation/recommendations',
  },
} as const;

/** Clés de stockage local (AsyncStorage). */
export const STORAGE_KEYS = {
  token: '@fightconnect/auth-token',
  user: '@fightconnect/auth-user',
  partnersCache: '@fightconnect/cache/partners',
  bookingsCache: '@fightconnect/cache/bookings',
  paymentsCache: '@fightconnect/cache/payments',
  statsCache: '@fightconnect/cache/stats',
  filters: '@fightconnect/filters',
} as const;
