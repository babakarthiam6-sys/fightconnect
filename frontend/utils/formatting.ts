import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

import { LEVEL_LABELS, STATUS_LABELS, STYLE_LABELS, WEIGHT_LABELS } from '@/constants/theme';

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : typeof value === 'number' ? new Date(value) : parseISO(value);
  return isValid(date) ? date : null;
}

export interface PriceOptions {
  /**
   * Force les centimes : « 6,00 € » plutôt que « 6 € ».
   *
   * Utile pour les montants dérivés d'un calcul — commission, part du
   * partenaire — que l'on aligne les uns sous les autres : un « 6 € » au milieu
   * de « 34,00 € » se lit comme une inattention.
   */
  cents?: boolean;
  /** Préfixe le montant d'un signe moins : « −6,00 € ». */
  negative?: boolean;
}

/**
 * « 1 250,00 € ». Le montant est attendu en unité majeure, pas en centimes.
 *
 * Seule fonction d'affichage des prix de l'application : virgule décimale et
 * espace insécable avant le symbole, partout et sans exception.
 */
export function formatPrice(
  amount: number | null | undefined,
  currency = 'EUR',
  options: PriceOptions = {},
): string {
  const safe = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  const decimals = options.cents || !Number.isInteger(safe) ? 2 : 0;
  let rendu: string;
  try {
    rendu = new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency || 'EUR',
      minimumFractionDigits: decimals,
      maximumFractionDigits: 2,
    }).format(safe);
  } catch {
    rendu = `${safe.toFixed(decimals).replace('.', ',')}\u00a0${currency}`;
  }
  // « − » (U+2212) et non le trait d'union : c'est le signe moins typographique,
  // et il se distingue du tiret des plages de poids affichées ailleurs.
  return options.negative && safe !== 0 ? `\u2212${rendu}` : rendu;
}

/** « lun. 12 mai 2025 à 18:30 ». */
export function formatDateTime(value: string | null | undefined): string {
  const date = toDate(value);
  if (!date) return 'Date à confirmer';
  return format(date, "EEE d MMM yyyy 'à' HH:mm", { locale: fr });
}

/** « 12 mai 2025 ». */
export function formatDate(value: string | null | undefined): string {
  const date = toDate(value);
  if (!date) return '—';
  return format(date, 'd MMM yyyy', { locale: fr });
}

/** « il y a 3 jours ». */
/** « 18:30 » — l'heure seule, pour les bulles d'une conversation. */
export function formatTime(value: string | null | undefined): string {
  const date = toDate(value);
  return date ? format(date, 'HH:mm', { locale: fr }) : '';
}

export function formatRelative(value: string | null | undefined): string {
  const date = toDate(value);
  if (!date) return '—';
  return formatDistanceToNow(date, { addSuffix: true, locale: fr });
}

/** 90 -> « 1 h 30 ». */
export function formatDuration(minutes: number | null | undefined): string {
  const total = typeof minutes === 'number' && minutes > 0 ? Math.round(minutes) : 0;
  if (total === 0) return '—';
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest.toString().padStart(2, '0')}`;
}

export function formatLevel(level: string | null | undefined): string {
  if (!level) return '—';
  return LEVEL_LABELS[level] ?? level;
}

export function formatStyle(style: string | null | undefined): string {
  if (!style) return '—';
  return STYLE_LABELS[style] ?? style;
}

export function formatWeightClass(weightClass: string | null | undefined): string {
  if (!weightClass) return '—';
  return WEIGHT_LABELS[weightClass] ?? weightClass;
}

export function formatStatus(status: string | null | undefined): string {
  if (!status) return '—';
  return STATUS_LABELS[status] ?? status;
}

/** « Jean D. » — utilisé partout où l'on affiche un tiers. */
export function formatUserName(
  user: { firstName?: string | null; lastName?: string | null } | null | undefined,
): string {
  const first = user?.firstName?.trim() ?? '';
  const last = user?.lastName?.trim() ?? '';
  if (!first && !last) return 'Utilisateur';
  if (!last) return first;
  return `${first} ${last.charAt(0).toUpperCase()}.`;
}

export function getInitials(
  user: { firstName?: string | null; lastName?: string | null } | null | undefined,
): string {
  const first = user?.firstName?.trim().charAt(0) ?? '';
  const last = user?.lastName?.trim().charAt(0) ?? '';
  const initials = `${first}${last}`.toUpperCase();
  return initials || '?';
}

/** Note moyenne : « 4,7 » ou « — » si aucune note. */
export function formatRating(rating: number | null | undefined): string {
  if (typeof rating !== 'number' || !Number.isFinite(rating) || rating <= 0) return '—';
  return rating.toFixed(1).replace('.', ',');
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
