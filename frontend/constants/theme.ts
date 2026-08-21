import { Platform } from 'react-native';

/**
 * Palette sombre.
 *
 * Le fond quasi noir n'est pas une coquetterie : les salles d'entraînement sont
 * mal éclairées et l'application se consulte au bord du tapis, souvent tard.
 * L'orange reste la seule couleur vive, ce qui laisse l'œil trouver
 * immédiatement l'action à faire sur chaque écran.
 */
export const COLORS = {
  primary: '#FF6B35',
  /** Fond des puces et pastilles orange : l'orange dilué dans le noir du fond. */
  primarySoft: '#3A1D11',
  /** Le bleu marine d'origine devient illisible sur fond sombre : on l'éclaircit. */
  secondary: '#5AA9F5',
  secondarySoft: '#132638',
  accent: '#F77F00',
  background: '#0C0C0E',
  surface: '#17171B',
  /** Cartes posées sur une autre carte (statistiques, champs de formulaire). */
  surfaceRaised: '#202027',
  error: '#FF5A5A',
  errorSoft: '#3A1717',
  success: '#3DD68C',
  successSoft: '#10301F',
  warning: '#F2C14E',
  warningSoft: '#33280D',
  text: '#FFFFFF',
  textMuted: '#9A9AA4',
  /** Texte posé sur un aplat orange ou rouge. */
  textInverse: '#FFFFFF',
  border: '#26262D',
  overlay: 'rgba(0, 0, 0, 0.72)',
  disabled: '#3A3A44',
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
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const TYPOGRAPHY = {
  display: { fontSize: 30, fontWeight: '800' },
  headline: { fontSize: 24, fontWeight: '700' },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 16, fontWeight: '600' },
  body: { fontSize: 14, fontWeight: '400' },
  button: { fontSize: 16, fontWeight: '700' },
  caption: { fontSize: 12, fontWeight: '400' },
} as const;

/**
 * Relief des cartes.
 *
 * Une ombre portée ne se voit pas sur un fond noir. Ce qui détache une carte
 * ici, c'est son fond plus clair que celui de l'écran, souligné d'un filet.
 * L'ombre native est conservée : elle ajoute une profondeur discrète sur iOS et
 * Android, où l'écran est physiquement plus contrasté.
 */
export const SHADOW = {
  borderColor: COLORS.border,
  borderWidth: 1,
  ...Platform.select({
    ios: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
    },
    android: { elevation: 4 },
    default: {},
  }),
} as object;

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
