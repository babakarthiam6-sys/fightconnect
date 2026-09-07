import type {
  Booking,
  BookingStatus,
  Conversation,
  Message,
  Partner,
  ProfileVideo,
  Payment,
  PayoutStatus,
  PaymentIntent,
  PaymentStatus,
  Review,
  RevenueStats,
  RiskLevel,
  SportProfile,
  SparringLevel,
  SparringStyle,
  User,
  UserRiskProfile,
  UserSummary,
  VideoKind,
  VideoProvider,
  WeightClass,
} from '@/types';

/**
 * Adaptateurs réseau -> modèle applicatif.
 *
 * Le backend FastAPI renvoie du snake_case et peut nommer un même champ de
 * plusieurs façons (`_id` / `id`, `price` / `price_cents`). Ces fonctions
 * absorbent ces variations pour qu'aucun écran n'ait à faire de `any`, et
 * garantissent qu'un champ manquant produit une valeur sûre plutôt qu'un crash.
 */

type Raw = Record<string, unknown>;

export function asRecord(value: unknown): Raw {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Raw)
    : {};
}

/** Première clé présente parmi celles proposées (alias snake_case / camelCase). */
function pick(source: Raw, keys: string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function str(source: Raw, keys: string[], fallback = ''): string {
  const value = pick(source, keys);
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function optionalStr(source: Raw, keys: string[]): string | null {
  const value = str(source, keys, '');
  return value.length > 0 ? value : null;
}

function num(source: Raw, keys: string[], fallback = 0): number {
  const value = pick(source, keys);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function optionalNum(source: Raw, keys: string[]): number | null {
  const value = pick(source, keys);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function bool(source: Raw, keys: string[], fallback = false): boolean {
  const value = pick(source, keys);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof value !== 'string') return fallback;
  const normalized = value.toLowerCase().replace(/[\s-]/g, '_');
  return (allowed as readonly string[]).includes(normalized) ? (normalized as T) : fallback;
}

const LEVELS = ['beginner', 'amateur', 'pro'] as const;

const VIDEO_KINDS = ['fight', 'sparring', 'shadow'] as const;
const VIDEO_PROVIDERS = ['youtube', 'tiktok', 'instagram'] as const;
const STYLES = [
  'boxing',
  'muay_thai',
  'kickboxing',
  'mma',
  'bjj',
  'wrestling',
  'karate',
  'judo',
] as const;
const WEIGHT_CLASSES = [
  'flyweight',
  'bantamweight',
  'featherweight',
  'lightweight',
  'welterweight',
  'middleweight',
  'light_heavyweight',
  'heavyweight',
] as const;
const BOOKING_STATUSES = [
  'pending',
  'accepted',
  'declined',
  'cancelled',
  'completed',
] as const;
const PAYMENT_STATUSES = [
  'pending',
  'processing',
  'succeeded',
  'failed',
  'refunded',
  'cancelled',
] as const;
const RISK_LEVELS = ['low', 'medium', 'high'] as const;

export function normalizeId(source: Raw): string {
  const raw = pick(source, ['id', '_id', 'uuid']);
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number') return String(raw);
  // Mongo peut sérialiser un ObjectId en { $oid: "..." }.
  const oid = asRecord(raw)['$oid'];
  return typeof oid === 'string' ? oid : '';
}

export function normalizeUserSummary(input: unknown): UserSummary | null {
  const raw = asRecord(input);
  const id = normalizeId(raw);
  if (!id && !str(raw, ['first_name', 'firstName'])) return null;

  return {
    id,
    firstName: str(raw, ['first_name', 'firstName']),
    lastName: str(raw, ['last_name', 'lastName']),
    avatarUrl: optionalStr(raw, ['avatar_url', 'avatarUrl', 'avatar']),
    averageRating: optionalNum(raw, ['average_rating', 'averageRating', 'rating']),
    city: optionalStr(raw, ['city', 'location']),
    pricePerRound: optionalNum(raw, ['price_per_round', 'pricePerRound']),
  };
}

/**
 * Champs sportifs.
 *
 * `null` n'est pas une valeur par défaut ici mais une information : le profil
 * n'est pas encore rempli. L'écran de profil s'en sert pour afficher
 * « Non défini » plutôt qu'une valeur inventée.
 */
/**
 * Une entrée de galerie.
 *
 * Une vidéo sans URL exploitable est écartée plutôt que rendue : une tuile qui
 * n'ouvre rien est pire qu'une case vide.
 */
function normalizeVideo(input: unknown): ProfileVideo | null {
  const raw = asRecord(input);
  const url = str(raw, ['url']);
  if (!url) return null;

  return {
    id: str(raw, ['id']) || url,
    url,
    provider: oneOf<VideoProvider>(raw.provider, VIDEO_PROVIDERS, 'youtube'),
    kind: oneOf<VideoKind>(raw.kind, VIDEO_KINDS, 'sparring'),
    caption: optionalStr(raw, ['caption']),
    thumbnailUrl: optionalStr(raw, ['thumbnail_url', 'thumbnailUrl']),
  };
}

export function normalizeVideos(input: unknown): ProfileVideo[] {
  if (input == null) return [];
  return extractList(input)
    .map(normalizeVideo)
    .filter((video): video is ProfileVideo => video !== null);
}

function normalizeSportProfile(raw: Raw): SportProfile {
  return {
    city: optionalStr(raw, ['city', 'location']),
    bio: optionalStr(raw, ['bio', 'description', 'about']),
    style: raw.style == null ? null : oneOf<SparringStyle>(raw.style, STYLES, 'boxing'),
    level: raw.level == null ? null : oneOf<SparringLevel>(raw.level, LEVELS, 'beginner'),
    weightClass:
      raw.weight_class == null && raw.weightClass == null
        ? null
        : oneOf<WeightClass>(
            pick(raw, ['weight_class', 'weightClass']),
            WEIGHT_CLASSES,
            'middleweight',
          ),
    heightCm: optionalNum(raw, ['height_cm', 'heightCm']),
    fightsCount: num(raw, ['fights_count', 'fightsCount'], 0),
    experienceYears: num(raw, ['experience_years', 'experienceYears'], 0),
    pricePerRound: optionalNum(raw, ['price_per_round', 'pricePerRound']),
    currency: str(raw, ['currency'], 'EUR').toUpperCase(),
    available: bool(raw, ['available', 'is_available']),
    videos: normalizeVideos(raw.videos),
  };
}

export function normalizePartner(input: unknown): Partner {
  const raw = asRecord(input);
  return {
    id: normalizeId(raw),
    firstName: str(raw, ['first_name', 'firstName']),
    lastName: str(raw, ['last_name', 'lastName']),
    avatarUrl: optionalStr(raw, ['avatar_url', 'avatarUrl', 'avatar']),
    averageRating: optionalNum(raw, ['average_rating', 'averageRating', 'rating']),
    ratingsCount: num(raw, ['ratings_count', 'ratingsCount', 'reviews_count'], 0),
    ...normalizeSportProfile(raw),
  };
}

export function normalizeUser(input: unknown): User {
  const raw = asRecord(input);
  return {
    id: normalizeId(raw),
    email: str(raw, ['email']),
    firstName: str(raw, ['first_name', 'firstName']),
    lastName: str(raw, ['last_name', 'lastName']),
    avatarUrl: optionalStr(raw, ['avatar_url', 'avatarUrl', 'avatar']),
    dischargeAccepted: bool(raw, ['discharge_accepted', 'dischargeAccepted', 'discharge']),
    averageRating: optionalNum(raw, ['average_rating', 'averageRating', 'rating']),
    ratingsCount: num(raw, ['ratings_count', 'ratingsCount', 'reviews_count'], 0),
    createdAt: optionalStr(raw, ['created_at', 'createdAt']),
    payoutsEnabled: bool(raw, ['payouts_enabled', 'payoutsEnabled']),
    expoPushToken: optionalStr(raw, ['expo_push_token', 'expoPushToken']),
    ...normalizeSportProfile(raw),
  };
}

export function normalizeMessage(input: unknown): Message {
  const raw = asRecord(input);
  return {
    id: normalizeId(raw),
    conversationId: str(raw, ['conversation_id', 'conversationId'], ''),
    senderId: str(raw, ['sender_id', 'senderId'], ''),
    recipientId: str(raw, ['recipient_id', 'recipientId'], ''),
    author: normalizeUserSummary(pick(raw, ['author', 'sender'])),
    content: str(raw, ['content', 'text', 'body'], ''),
    read: bool(raw, ['read', 'is_read']),
    createdAt: optionalStr(raw, ['created_at', 'createdAt', 'timestamp']),
  };
}

export function normalizeConversation(input: unknown): Conversation {
  const raw = asRecord(input);
  return {
    id: normalizeId(raw),
    other: normalizeUserSummary(pick(raw, ['other', 'partner', 'user'])),
    lastMessage: str(raw, ['last_message', 'lastMessage'], ''),
    lastMessageAt: optionalStr(raw, ['last_message_at', 'lastMessageAt']),
    unread: num(raw, ['unread', 'unread_count'], 0),
  };
}

export function normalizePayoutStatus(input: unknown): PayoutStatus {
  const raw = asRecord(input);
  return {
    connected: bool(raw, ['connected']),
    detailsSubmitted: bool(raw, ['details_submitted', 'detailsSubmitted']),
    payoutsEnabled: bool(raw, ['payouts_enabled', 'payoutsEnabled']),
    stripeConfigured: bool(raw, ['stripe_configured', 'stripeConfigured']),
  };
}

export function normalizeBooking(input: unknown): Booking {
  const raw = asRecord(input);
  const rounds = num(raw, ['rounds'], 1);
  const pricePerRound = num(raw, ['price_per_round', 'pricePerRound'], 0);

  // Le total vient du serveur : c'est lui qui fait foi puisque c'est lui qui
  // facture. Le recalcul local ne sert que si le champ manque.
  const total = optionalNum(raw, ['total', 'amount']) ?? rounds * pricePerRound;
  const commission = num(raw, ['commission', 'application_fee'], 0);

  return {
    id: normalizeId(raw),
    requester: normalizeUserSummary(pick(raw, ['requester', 'user', 'from'])),
    partner: normalizeUserSummary(pick(raw, ['partner', 'to'])),
    scheduledAt: str(raw, ['scheduled_at', 'scheduledAt', 'date'], ''),
    rounds,
    pricePerRound,
    total,
    commission,
    payout: optionalNum(raw, ['payout', 'net']) ?? total - commission,
    currency: str(raw, ['currency'], 'EUR').toUpperCase(),
    status: oneOf<BookingStatus>(pick(raw, ['status']), BOOKING_STATUSES, 'pending'),
    paid: bool(raw, ['paid', 'is_paid']),
    reviewed: bool(raw, ['reviewed', 'is_reviewed']),
    createdAt: optionalStr(raw, ['created_at', 'createdAt']),
  };
}

export function normalizePayment(input: unknown): Payment {
  const raw = asRecord(input);
  const amountCents = optionalNum(raw, ['amount_cents', 'amount_in_cents']);
  const amount = amountCents !== null ? amountCents / 100 : num(raw, ['amount', 'price'], 0);

  return {
    id: normalizeId(raw) || str(raw, ['payment_intent_id', 'stripe_payment_intent_id'], ''),
    bookingId: optionalStr(raw, ['booking_id', 'bookingId']),
    partnerName: optionalStr(raw, ['partner_name', 'partnerName', 'description']),
    amount,
    currency: str(raw, ['currency'], 'EUR').toUpperCase(),
    status: oneOf<PaymentStatus>(pick(raw, ['status', 'state']), PAYMENT_STATUSES, 'pending'),
    createdAt: optionalStr(raw, ['created_at', 'createdAt', 'date']),
    receiptUrl: optionalStr(raw, ['receipt_url', 'receiptUrl']),
  };
}

export function normalizeRevenueStats(input: unknown): RevenueStats {
  const raw = asRecord(input);
  return {
    totalEarnings: num(raw, ['total_earnings', 'totalEarnings', 'earnings'], 0),
    balance: num(raw, ['balance', 'available_balance'], 0),
    completedBookings: num(raw, ['completed_bookings', 'completedBookings'], 0),
    totalBookings: num(raw, ['total_bookings', 'totalBookings', 'bookings_count'], 0),
    averageRating: optionalNum(raw, ['average_rating', 'averageRating', 'rating']),
    currency: str(raw, ['currency'], 'EUR').toUpperCase(),
  };
}

export function normalizeReview(input: unknown): Review {
  const raw = asRecord(input);
  const moderation = asRecord(pick(raw, ['moderation', 'moderation_result']));

  return {
    id: normalizeId(raw),
    bookingId: str(raw, ['booking_id', 'bookingId'], ''),
    author: normalizeUserSummary(pick(raw, ['author', 'user', 'reviewer'])),
    rating: num(raw, ['rating', 'score'], 0),
    comment: str(raw, ['comment', 'content', 'text'], ''),
    createdAt: optionalStr(raw, ['created_at', 'createdAt']),
    flagged:
      bool(raw, ['flagged', 'is_flagged', 'ai_flagged']) ||
      bool(moderation, ['flagged', 'is_flagged']),
    flagReason:
      optionalStr(raw, ['flag_reason', 'flagReason', 'moderation_reason']) ??
      optionalStr(moderation, ['reason', 'category']),
    moderationScore:
      optionalNum(raw, ['moderation_score', 'moderationScore']) ??
      optionalNum(moderation, ['score', 'confidence']),
  };
}

export function normalizeUserRisk(input: unknown): UserRiskProfile {
  const raw = asRecord(input);
  const reasonsRaw = pick(raw, ['reasons', 'signals', 'flags']);

  return {
    userId: str(raw, ['user_id', 'userId'], normalizeId(raw)),
    riskLevel: oneOf<RiskLevel>(pick(raw, ['risk_level', 'riskLevel', 'level']), RISK_LEVELS, 'low'),
    score: num(raw, ['score', 'risk_score'], 0),
    reasons: Array.isArray(reasonsRaw)
      ? reasonsRaw.filter((item): item is string => typeof item === 'string')
      : [],
  };
}

export function normalizePaymentIntent(input: unknown): PaymentIntent {
  const raw = asRecord(input);
  return {
    clientSecret: str(raw, ['client_secret', 'clientSecret'], ''),
    paymentIntentId: optionalStr(raw, ['payment_intent_id', 'paymentIntentId', 'id']),
    ephemeralKey: optionalStr(raw, ['ephemeral_key', 'ephemeralKey']),
    customerId: optionalStr(raw, ['customer_id', 'customerId', 'customer']),
    publishableKey: optionalStr(raw, ['publishable_key', 'publishableKey']),
    amount: optionalNum(raw, ['amount']),
    currency: str(raw, ['currency'], 'EUR').toUpperCase(),
  };
}

/**
 * Extrait la liste d'une réponse paginée.
 *
 * Accepte `[...]`, `{ items: [...] }`, `{ results: [...] }` ou `{ data: [...] }`
 * — les trois conventions FastAPI les plus courantes.
 */
export function extractList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const raw = asRecord(payload);
  for (const key of [
    'items',
    'results',
    'data',
    'partners',
    'bookings',
    'payments',
    'reviews',
    'messages',
    'conversations',
  ]) {
    const value = raw[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

export function extractTotal(payload: unknown, fallback: number): number {
  const raw = asRecord(payload);
  const total = optionalNum(raw, ['total', 'count', 'total_count']);
  return total ?? fallback;
}
