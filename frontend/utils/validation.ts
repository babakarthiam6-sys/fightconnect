import { z } from 'zod';

import { CONFIG } from '@/constants/config';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'valid.emailObligatoire')
  .regex(EMAIL_RE, 'valid.emailInvalide')
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(CONFIG.minPasswordLength, 'valid.motDePasseMin')
  .regex(/[A-Z]/, 'valid.majuscule')
  .regex(/[0-9]/, 'valid.chiffre');

const nameSchema = z
  .string()
  .trim()
  .min(2, 'valid.min2')
  .max(50, 'valid.max50');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'valid.motDePasseObligatoire'),
});

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  dischargeAccepted: z.literal(true, {
    errorMap: () => ({ message: 'valid.decharge' }),
  }),
});

export const bookingSchema = z.object({
  scheduledAt: z
    .string()
    .min(1, 'valid.date')
    .refine((value) => {
      const time = Date.parse(value);
      return Number.isFinite(time) && time > Date.now();
    }, 'valid.dateFuture'),
  rounds: z
    .number({ invalid_type_error: 'valid.nombre' })
    .int('valid.entier')
    .min(1, 'valid.min1Round')
    .max(20, 'valid.max20Rounds'),
});

/**
 * Profil sportif.
 *
 * Tous les champs sont facultatifs : l'écran enregistre une ligne à la fois, et
 * un compte tout juste créé n'en a encore aucun.
 */
export const profileSchema = z.object({
  // Validés côté serveur contre la liste ISO : ici on ne vérifie que la forme,
  // sans recopier deux cent quarante-neuf codes dans le mobile.
  country: z.string().length(2).optional(),
  currency: z.string().length(3).optional(),
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  city: z.string().trim().max(80, 'valid.max80').optional(),
  bio: z.string().trim().max(600, 'valid.max600').optional(),
  level: z.enum(['beginner', 'amateur', 'pro']).optional(),
  style: z
    .enum(['boxing', 'muay_thai', 'kickboxing', 'mma', 'bjj', 'wrestling', 'karate', 'judo'])
    .optional(),
  weightClass: z
    .enum([
      'flyweight',
      'bantamweight',
      'featherweight',
      'lightweight',
      'welterweight',
      'middleweight',
      'light_heavyweight',
      'heavyweight',
    ])
    .optional(),
  heightCm: z
    .number({ invalid_type_error: 'valid.tailleInvalide' })
    .int('valid.entier')
    .min(120, 'valid.tailleMin')
    .max(250, 'valid.tailleMax')
    .optional(),
  fightsCount: z
    .number({ invalid_type_error: 'valid.nombre' })
    .int('valid.entier')
    .min(0, 'valid.negatif')
    .max(2000, 'valid.max2000')
    .optional(),
  experienceYears: z
    .number({ invalid_type_error: 'valid.nombre' })
    .int('valid.entier')
    .min(0, 'valid.negatif')
    .max(80, 'valid.max80ans')
    .optional(),
  pricePerRound: z
    .number({ invalid_type_error: 'valid.tarifInvalide' })
    .min(0, 'valid.tarifNegatif')
    .max(1000, 'valid.tarifMax')
    .optional(),
  available: z.boolean().optional(),
});

export const reviewSchema = z.object({
  rating: z
    .number({ invalid_type_error: 'valid.noteInvalide' })
    .int()
    .min(1, 'valid.note1a5')
    .max(5, 'valid.note1a5'),
  comment: z
    .string()
    .trim()
    .min(10, 'valid.min10')
    .max(CONFIG.maxReviewLength, `Au plus ${CONFIG.maxReviewLength} caractères.`),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type BookingInput = z.infer<typeof bookingSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;

/** Erreurs de formulaire indexées par nom de champ. */
export type FieldErrors<T> = Partial<Record<keyof T, string>>;

export interface ValidationResult<T> {
  success: boolean;
  data: T | null;
  errors: FieldErrors<T>;
}

/**
 * Valide une saisie et renvoie la première erreur par champ.
 *
 * Zod peut produire plusieurs erreurs pour un même champ ; n'en afficher qu'une
 * évite d'empiler trois messages sous un seul input.
 */
/**
 * Valide une saisie et rend les erreurs prêtes à afficher.
 *
 * Les schémas Zod sont des constantes de module : ils ne peuvent pas appeler de
 * hook, et portent donc des **clés** de traduction plutôt que des phrases. La
 * traduction se fait ici, au moment précis où le message devient visible. Sans
 * traducteur, la clé ressort — laide, donc repérable.
 */
export function validate<S extends z.ZodTypeAny>(
  schema: S,
  input: unknown,
  t?: (cle: never) => string,
): ValidationResult<z.infer<S>> {
  const result = schema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data, errors: {} };
  }

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key !== 'string' || key in errors) continue;
    errors[key] = t ? t(issue.message as never) : issue.message;
  }

  return { success: false, data: null, errors: errors as FieldErrors<z.infer<S>> };
}

/** Force de mot de passe, pour la jauge affichée à l'inscription. */
export function passwordStrength(password: string): {
  score: 0 | 1 | 2 | 3;
  /** Clé de traduction du libellé, à passer au traducteur de l'écran. */
  label: 'valid.force0' | 'valid.force1' | 'valid.force2' | 'valid.force3';
} {
  const checks = [
    password.length >= CONFIG.minPasswordLength,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password) && password.length >= 12,
  ].filter(Boolean).length;

  if (checks <= 1) return { score: 0, label: 'valid.force0' };
  if (checks === 2) return { score: 1, label: 'valid.force1' };
  if (checks === 3) return { score: 2, label: 'valid.force2' };
  return { score: 3, label: 'valid.force3' };
}
