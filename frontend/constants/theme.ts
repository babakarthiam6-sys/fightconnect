import { Platform } from 'react-native';

export const COLORS = {
  primary: '#FF6B35',
  secondary: '#004E89',
  accent: '#F77F00',
  background: '#FAFAFA',
  surface: '#FFFFFF',
  error: '#D62828',
  success: '#2A9D8F',
  warning: '#E9C46A',
  text: '#1A1A1A',
  textMuted: '#6B7280',
  textInverse: '#FFFFFF',
  border: '#E5E7EB',
  overlay: 'rgba(0, 0, 0, 0.45)',
  disabled: '#C7CBD1',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

export const TYPOGRAPHY = {
  headline: { fontSize: 24, fontWeight: '700' },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 16, fontWeight: '600' },
  body: { fontSize: 14, fontWeight: '400' },
  button: { fontSize: 16, fontWeight: '600' },
  caption: { fontSize: 12, fontWeight: '400' },
} as const;

/** Ombre portée des cartes, déclinée par plateforme. */
export const SHADOW = Platform.select({
  ios: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  android: { elevation: 3 },
  default: {},
}) as object;

export const LEVEL_LABELS: Record<string, string> = {
  beginner: 'Débutant',
  intermediate: 'Intermédiaire',
  advanced: 'Avancé',
  pro: 'Professionnel',
};

export const STYLE_LABELS: Record<string, string> = {
  boxing: 'Boxe anglaise',
  muay_thai: 'Muay-thaï',
  kickboxing: 'Kickboxing',
  mma: 'MMA',
  bjj: 'JJB',
  wrestling: 'Lutte',
  karate: 'Karaté',
  judo: 'Judo',
};

export const STATUS_LABELS: Record<string, string> = {
  open: 'Ouvert',
  full: 'Complet',
  completed: 'Terminé',
  cancelled: 'Annulé',
  pending: 'En attente',
  processing: 'En cours',
  succeeded: 'Payé',
  failed: 'Échoué',
  refunded: 'Remboursé',
};
