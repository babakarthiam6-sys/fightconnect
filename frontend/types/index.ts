/**
 * Contrat de données partagé entre l'app et l'API FastAPI.
 *
 * L'API renvoie du snake_case (convention Python/Pydantic) ; l'app manipule du
 * camelCase. La conversion est centralisée dans `utils/normalize.ts` : ces types
 * décrivent donc TOUJOURS la forme côté app, jamais la forme réseau brute.
 */

export type SparringLevel = 'beginner' | 'intermediate' | 'advanced' | 'pro';

export type SparringStyle =
  | 'boxing'
  | 'muay_thai'
  | 'kickboxing'
  | 'mma'
  | 'bjj'
  | 'wrestling'
  | 'karate'
  | 'judo';

export type SparringStatus = 'open' | 'full' | 'completed' | 'cancelled';

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'refunded'
  | 'cancelled';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  dischargeAccepted: boolean;
  averageRating: number | null;
  ratingsCount: number;
  createdAt: string | null;
}

/** Version allégée d'un utilisateur telle qu'imbriquée dans un sparring. */
export interface UserSummary {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  averageRating: number | null;
}

export interface Sparring {
  id: string;
  title: string;
  description: string;
  location: string;
  /** ISO 8601. */
  scheduledAt: string;
  durationMinutes: number;
  level: SparringLevel;
  style: SparringStyle;
  /** Prix en euros (unité majeure), jamais en centimes. */
  price: number;
  currency: string;
  maxParticipants: number;
  participants: UserSummary[];
  creator: UserSummary | null;
  status: SparringStatus;
  createdAt: string | null;
}

export interface Payment {
  id: string;
  sparringId: string | null;
  sparringTitle: string | null;
  /** Montant en euros (unité majeure). */
  amount: number;
  currency: string;
  status: PaymentStatus;
  createdAt: string | null;
  receiptUrl: string | null;
}

export interface RevenueStats {
  totalEarnings: number;
  balance: number;
  completedSparrings: number;
  totalSparrings: number;
  averageRating: number | null;
  currency: string;
}

export interface Review {
  id: string;
  sparringId: string;
  author: UserSummary | null;
  rating: number;
  comment: string;
  createdAt: string | null;
  /** Signalé par la modération IA côté backend. */
  flagged: boolean;
  flagReason: string | null;
  moderationScore: number | null;
}

export interface UserRiskProfile {
  userId: string;
  riskLevel: RiskLevel;
  score: number;
  reasons: string[];
}

export interface AuthSession {
  token: string;
  user: User;
}

export interface PaymentIntent {
  clientSecret: string;
  paymentIntentId: string | null;
  ephemeralKey: string | null;
  customerId: string | null;
  publishableKey: string | null;
  amount: number | null;
  currency: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface SparringFilters {
  search: string;
  level: SparringLevel | null;
  style: SparringStyle | null;
  minPrice: number | null;
  maxPrice: number | null;
}

/** Erreur applicative normalisée : toute la couche réseau ne rejette que ça. */
export interface AppError {
  message: string;
  status: number | null;
  /** `true` si l'échec vient de l'absence de réseau et non du serveur. */
  isNetworkError: boolean;
  fieldErrors: Record<string, string> | null;
}
