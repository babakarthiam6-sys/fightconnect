import { z } from 'zod';

import { CONFIG } from '@/constants/config';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'L’email est obligatoire.')
  .regex(EMAIL_RE, 'Format d’email invalide.')
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(CONFIG.minPasswordLength, `Au moins ${CONFIG.minPasswordLength} caractères.`)
  .regex(/[A-Z]/, 'Au moins une majuscule.')
  .regex(/[0-9]/, 'Au moins un chiffre.');

const nameSchema = z
  .string()
  .trim()
  .min(2, 'Au moins 2 caractères.')
  .max(50, 'Au plus 50 caractères.');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Le mot de passe est obligatoire.'),
});

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  dischargeAccepted: z.literal(true, {
    errorMap: () => ({ message: 'Vous devez accepter la décharge de responsabilité.' }),
  }),
});

export const sparringSchema = z.object({
  title: z.string().trim().min(5, 'Au moins 5 caractères.').max(80, 'Au plus 80 caractères.'),
  description: z
    .string()
    .trim()
    .min(20, 'Décrivez la séance en 20 caractères minimum.')
    .max(1000, 'Au plus 1000 caractères.'),
  location: z.string().trim().min(3, 'Indiquez un lieu.').max(120, 'Au plus 120 caractères.'),
  scheduledAt: z
    .string()
    .min(1, 'Choisissez une date.')
    .refine((value) => {
      const time = Date.parse(value);
      return Number.isFinite(time) && time > Date.now();
    }, 'La séance doit être programmée dans le futur.'),
  durationMinutes: z
    .number({ invalid_type_error: 'Durée invalide.' })
    .int('Durée en minutes entières.')
    .min(15, 'Au moins 15 minutes.')
    .max(480, 'Au plus 8 heures.'),
  level: z.enum(['beginner', 'intermediate', 'advanced', 'pro'], {
    errorMap: () => ({ message: 'Choisissez un niveau.' }),
  }),
  style: z.enum(['boxing', 'muay_thai', 'kickboxing', 'mma', 'bjj', 'wrestling', 'karate', 'judo'], {
    errorMap: () => ({ message: 'Choisissez une discipline.' }),
  }),
  price: z
    .number({ invalid_type_error: 'Prix invalide.' })
    .min(0, 'Le prix ne peut pas être négatif.')
    .max(1000, 'Au plus 1000 €.'),
  maxParticipants: z
    .number({ invalid_type_error: 'Nombre invalide.' })
    .int('Nombre entier attendu.')
    .min(2, 'Au moins 2 participants.')
    .max(50, 'Au plus 50 participants.'),
});

export const reviewSchema = z.object({
  rating: z
    .number({ invalid_type_error: 'Note invalide.' })
    .int()
    .min(1, 'Donnez une note entre 1 et 5.')
    .max(5, 'Donnez une note entre 1 et 5.'),
  comment: z
    .string()
    .trim()
    .min(10, 'Au moins 10 caractères.')
    .max(CONFIG.maxReviewLength, `Au plus ${CONFIG.maxReviewLength} caractères.`),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type SparringInput = z.infer<typeof sparringSchema>;
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
export function validate<S extends z.ZodTypeAny>(
  schema: S,
  input: unknown,
): ValidationResult<z.infer<S>> {
  const result = schema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data, errors: {} };
  }

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key !== 'string' || key in errors) continue;
    errors[key] = issue.message;
  }

  return { success: false, data: null, errors: errors as FieldErrors<z.infer<S>> };
}

/** Force de mot de passe, pour la jauge affichée à l'inscription. */
export function passwordStrength(password: string): { score: 0 | 1 | 2 | 3; label: string } {
  const checks = [
    password.length >= CONFIG.minPasswordLength,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password) && password.length >= 12,
  ].filter(Boolean).length;

  if (checks <= 1) return { score: 0, label: 'Trop faible' };
  if (checks === 2) return { score: 1, label: 'Faible' };
  if (checks === 3) return { score: 2, label: 'Correct' };
  return { score: 3, label: 'Solide' };
}
