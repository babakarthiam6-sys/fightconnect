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
  },
  sparrings: {
    list: '/sparrings',
    create: '/sparrings',
    detail: (id: string) => `/sparrings/${id}`,
    join: (id: string) => `/sparrings/${id}/join`,
    cancel: (id: string) => `/sparrings/${id}/cancel`,
    reviews: (id: string) => `/sparrings/${id}/reviews`,
  },
  payments: {
    createIntent: '/payments/create-intent',
    history: '/payments/history',
  },
  revenue: {
    stats: '/revenue/stats',
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
  sparringsCache: '@fightconnect/cache/sparrings',
  paymentsCache: '@fightconnect/cache/payments',
  statsCache: '@fightconnect/cache/stats',
  filters: '@fightconnect/filters',
} as const;
