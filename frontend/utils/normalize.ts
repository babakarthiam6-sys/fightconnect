import type {
  Payment,
  PaymentIntent,
  PaymentStatus,
  Review,
  RevenueStats,
  RiskLevel,
  Sparring,
  SparringLevel,
  SparringStatus,
  SparringStyle,
  User,
  UserRiskProfile,
  UserSummary,
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

const LEVELS = ['beginner', 'intermediate', 'advanced', 'pro'] as const;
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
const SPARRING_STATUSES = ['open', 'full', 'completed', 'cancelled'] as const;
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
  };
}

export function normalizeSparring(input: unknown): Sparring {
  const raw = asRecord(input);
  const participantsRaw = pick(raw, ['participants', 'participant_list']);
  const participants = Array.isArray(participantsRaw)
    ? participantsRaw
        .map((item) =>
          typeof item === 'string'
            ? ({
                id: item,
                firstName: '',
                lastName: '',
                avatarUrl: null,
                averageRating: null,
              } satisfies UserSummary)
            : normalizeUserSummary(item),
        )
        .filter((item): item is UserSummary => item !== null)
    : [];

  // Certains backends exposent le prix en centimes : on repasse en euros.
  const priceCents = optionalNum(raw, ['price_cents', 'amount_cents']);
  const price = priceCents !== null ? priceCents / 100 : num(raw, ['price', 'amount'], 0);

  return {
    id: normalizeId(raw),
    title: str(raw, ['title', 'name'], 'Sparring'),
    description: str(raw, ['description'], ''),
    location: str(raw, ['location', 'city', 'address'], ''),
    scheduledAt: str(raw, ['scheduled_at', 'scheduledAt', 'date', 'start_time'], ''),
    durationMinutes: num(raw, ['duration_minutes', 'durationMinutes', 'duration'], 60),
    level: oneOf<SparringLevel>(pick(raw, ['level']), LEVELS, 'beginner'),
    style: oneOf<SparringStyle>(pick(raw, ['style', 'discipline']), STYLES, 'boxing'),
    price,
    currency: str(raw, ['currency'], 'EUR').toUpperCase(),
    maxParticipants: num(raw, ['max_participants', 'maxParticipants'], 2),
    participants,
    creator: normalizeUserSummary(pick(raw, ['creator', 'owner', 'author', 'created_by'])),
    status: oneOf<SparringStatus>(pick(raw, ['status']), SPARRING_STATUSES, 'open'),
    createdAt: optionalStr(raw, ['created_at', 'createdAt']),
  };
}

export function normalizePayment(input: unknown): Payment {
  const raw = asRecord(input);
  const amountCents = optionalNum(raw, ['amount_cents', 'amount_in_cents']);
  const amount = amountCents !== null ? amountCents / 100 : num(raw, ['amount', 'price'], 0);

  return {
    id: normalizeId(raw) || str(raw, ['payment_intent_id', 'stripe_payment_intent_id'], ''),
    sparringId: optionalStr(raw, ['sparring_id', 'sparringId']),
    sparringTitle: optionalStr(raw, ['sparring_title', 'sparringTitle', 'description']),
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
    completedSparrings: num(raw, ['completed_sparrings', 'completedSparrings'], 0),
    totalSparrings: num(raw, ['total_sparrings', 'totalSparrings', 'sparrings_count'], 0),
    averageRating: optionalNum(raw, ['average_rating', 'averageRating', 'rating']),
    currency: str(raw, ['currency'], 'EUR').toUpperCase(),
  };
}

export function normalizeReview(input: unknown): Review {
  const raw = asRecord(input);
  const moderation = asRecord(pick(raw, ['moderation', 'moderation_result']));

  return {
    id: normalizeId(raw),
    sparringId: str(raw, ['sparring_id', 'sparringId'], ''),
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
  for (const key of ['items', 'results', 'data', 'sparrings', 'payments', 'reviews']) {
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
