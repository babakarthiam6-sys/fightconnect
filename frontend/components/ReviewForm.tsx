import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import Button from '@/components/Button';
import Input from '@/components/Input';
import RatingStars from '@/components/RatingStars';
import { COLORS, RADIUS, SHADOW, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useT } from '@/i18n';
import { CONFIG } from '@/constants/config';
import { moderationService } from '@/services/moderation';
import { reviewSchema, validate, type FieldErrors, type ReviewInput } from '@/utils/validation';
import type { AppError, Review } from '@/types';

interface Props {
  bookingId: string;
  /** Reçoit l'avis créé, éventuellement signalé par la modération IA. */
  onSubmitted: (review: Review) => void;
  onError?: (error: AppError) => void;
}

export function ReviewForm({ bookingId, onSubmitted, onError }: Props) {
  const t = useT();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [errors, setErrors] = useState<FieldErrors<ReviewInput>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    const result = validate(reviewSchema, { rating, comment }, t as never);
    setErrors(result.errors);
    if (!result.success || !result.data) return;

    setIsSubmitting(true);
    try {
      const review = await moderationService.postReview(bookingId, result.data);
      setRating(0);
      setComment('');
      setErrors({});
      onSubmitted(review);
    } catch (error) {
      const appError = error as AppError;
      // Le backend peut renvoyer une erreur de champ (avis en double, etc.).
      if (appError.fieldErrors?.comment) {
        setErrors({ comment: appError.fieldErrors.comment });
      }
      onError?.(appError);
    } finally {
      setIsSubmitting(false);
    }
  }, [t, bookingId, comment, onError, onSubmitted, rating]);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Laisser un avis</Text>

      <View style={styles.ratingRow}>
        <RatingStars value={rating} size={28} onChange={setRating} />
        <Text style={styles.ratingHint}>{rating > 0 ? `${rating}/5` : t('avis.note')}</Text>
      </View>
      {errors.rating ? <Text style={styles.error}>{errors.rating}</Text> : null}

      <Input
        label="Commentaire"
        value={comment}
        onChangeText={setComment}
        error={errors.comment}
        hint={`${comment.length}/${CONFIG.maxReviewLength} — les avis sont analysés automatiquement.`}
        placeholder={t('avis.question')}
        multiline
        maxLength={CONFIG.maxReviewLength}
      />

      <Button label={t('avis.publier')} onPress={handleSubmit} loading={isSubmitting} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...SHADOW,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
  },
  title: { ...TYPOGRAPHY.subtitle, color: COLORS.text, marginBottom: SPACING.md },
  ratingRow: { alignItems: 'center', flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.md },
  ratingHint: { ...TYPOGRAPHY.caption, color: COLORS.textMuted },
  error: { ...TYPOGRAPHY.caption, color: COLORS.error, marginBottom: SPACING.sm },
});

export default ReviewForm;
