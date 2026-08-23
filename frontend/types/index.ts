/**
 * Contrat de données partagé entre l'app et l'API FastAPI.
 *
 * L'API renvoie du snake_case (convention Python/Pydantic) ; l'app manipule du
 * camelCase. La conversion est centralisée dans `utils/normalize.ts` : ces types
 * décrivent donc TOUJOURS la forme côté app, jamais la forme réseau brute.
 */

export type SparringLevel = 'beginner' | 'amateur' | 'pro';

export type SparringStyle =
  | 'boxing'
  | 'muay_thai'
  | 'kickboxing'
  | 'mma'
  | 'bjj'
  | 'wrestling'
  | 'karate'
  | 'judo';

export type WeightClass =
  | 'flyweight'
  | 'bantamweight'
  | 'featherweight'
  | 'lightweight'
  | 'welterweight'
  | 'middleweight'
  | 'light_heavyweight'
  | 'heavyweight';

export type BookingStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'completed';

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'refunded'
  | 'cancelled';

export type RiskLevel = 'low' | 'medium' | 'high';

/** Champs sportifs, communs au profil privé et à la fiche publique. */
export interface SportProfile {
  city: string | null;
  /** ISO 3166-1 alpha-2, en majuscules. `null` tant qu'il n'est pas déclaré. */
  country: string | null;
  bio: string | null;
  style: SparringStyle | null;
  level: SparringLevel | null;
  weightClass: WeightClass | null;
  heightCm: number | null;
  fightsCount: number;
  experienceYears: number;
  /** Tarif d'un round, en euros. `null` tant qu'il n'est pas fixé. */
  pricePerRound: number | null;
  currency: string;
  /** Visible dans la recherche et réservable. */
  available: boolean;
}

export interface User extends SportProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  dischargeAccepted: boolean;
  averageRating: number | null;
  ratingsCount: number;
  createdAt: string | null;
  /** Stripe accepte de verser l'argent des séances à cette personne. */
  payoutsEnabled: boolean;
  /** Jeton d'appareil pour les notifications. `null` sur le web. */
  expoPushToken: string | null;
}

/** Version allégée d'un utilisateur, telle qu'imbriquée dans une demande. */
export interface UserSummary {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  averageRating: number | null;
  city: string | null;
  pricePerRound: number | null;
}

/** Fiche publique d'un partenaire : jamais d'email ni de données de compte. */
export interface Partner extends SportProfile {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  averageRating: number | null;
  ratingsCount: number;
  /** Stripe accepte de verser l'argent des séances à cette personne. */
  payoutsEnabled: boolean;
}

export interface Booking {
  id: string;
  requester: UserSummary | null;
  partner: UserSummary | null;
  /** ISO 8601. */
  scheduledAt: string;
  rounds: number;
  /** Tous les montants sont en euros (unité majeure), jamais en centimes. */
  pricePerRound: number;
  total: number;
  /** Part de la plateforme, prélevée sur le versement au partenaire. */
  commission: number;
  /** Ce que touche le partenaire : `total` moins `commission`. */
  payout: number;
  currency: string;
  status: BookingStatus;
  paid: boolean;
  reviewed: boolean;
  createdAt: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  author: UserSummary | null;
  content: string;
  read: boolean;
  createdAt: string | null;
}

export interface Conversation {
  id: string;
  /** L'interlocuteur, jamais soi-même. */
  other: UserSummary | null;
  lastMessage: string;
  lastMessageAt: string | null;
  unread: number;
}

export interface Payment {
  id: string;
  bookingId: string | null;
  partnerName: string | null;
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
  completedBookings: number;
  totalBookings: number;
  averageRating: number | null;
  currency: string;
}

export interface Review {
  id: string;
  bookingId: string;
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

export interface PartnerFilters {
  city: string;
  /** ISO 3166-1 alpha-2. Sans lui, « Paris » ramène la France et le Texas. */
  country: string | null;
  level: SparringLevel | null;
  style: SparringStyle | null;
  weightClass: WeightClass | null;
}

/** Erreur applicative normalisée : toute la couche réseau ne rejette que ça. */
export interface AppError {
  message: string;
  status: number | null;
  /** `true` si l'échec vient de l'absence de réseau et non du serveur. */
  isNetworkError: boolean;
  fieldErrors: Record<string, string> | null;
}

/** État du compte de versement d'un partenaire. */
export interface PayoutStatus {
  /** Un compte Stripe existe, même incomplet. */
  connected: boolean;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  /** `false` si la plateforme elle-même n'a pas de clé Stripe. */
  stripeConfigured: boolean;
}
