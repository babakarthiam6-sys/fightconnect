import React, { useCallback, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import Badge from '@/components/Badge';
import Button from '@/components/Button';
import { COLORS, RADIUS, SHADOW, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { payoutService } from '@/services/payout';
import type { AppError, PayoutStatus } from '@/types';

interface Props {
  status: PayoutStatus;
  onChanged: () => void;
  onError?: (error: AppError) => void;
}

/**
 * Configuration des versements de l'organisateur.
 *
 * L'inscription se fait sur les pages de Stripe : l'application ne collecte
 * aucune pièce d'identité ni coordonnée bancaire, elle ouvre un lien.
 */
export function PayoutCard({ status, onChanged, onError }: Props) {
  const [isLoading, setIsLoading] = useState(false);

  const open = useCallback(async () => {
    setIsLoading(true);
    try {
      const url = await payoutService.onboardingUrl();
      await Linking.openURL(url);
      // Au retour de Stripe l'état a pu changer : le parent le rechargera.
      onChanged();
    } catch (error) {
      onError?.(error as AppError);
    } finally {
      setIsLoading(false);
    }
  }, [onChanged, onError]);

  if (!status.stripeConfigured) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Recevoir mes paiements</Text>
        <Text style={styles.body}>
          Les paiements ne sont pas encore activés sur cette installation.
        </Text>
      </View>
    );
  }

  if (status.payoutsEnabled) {
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>Recevoir mes paiements</Text>
          <Badge label="Actif" tone="success" icon="checkmark-circle-outline" />
        </View>
        <Text style={styles.body}>
          Stripe verse automatiquement votre part sur votre compte bancaire après chaque séance
          payée.
        </Text>
      </View>
    );
  }

  // Compte commencé mais pas terminé : le distinguer évite de laisser croire
  // qu'il faut tout recommencer.
  const enCours = status.connected && status.detailsSubmitted;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Recevoir mes paiements</Text>
        <Badge
          label={enCours ? 'Vérification en cours' : 'À configurer'}
          tone={enCours ? 'warning' : 'danger'}
          icon="alert-circle-outline"
        />
      </View>

      <Text style={styles.body}>
        {enCours
          ? 'Stripe vérifie vos informations. Cela prend généralement quelques minutes.'
          : 'Tant que ce n’est pas fait, personne ne peut réserver vos séances payantes.'}
      </Text>

      <Button
        label={enCours ? 'Reprendre la vérification' : 'Configurer mes versements'}
        onPress={open}
        loading={isLoading}
        variant={enCours ? 'outline' : 'primary'}
        icon={
          enCours ? undefined : (
            <Ionicons name="card-outline" size={16} color={COLORS.textInverse} />
          )
        }
        style={styles.action}
      />

      <Text style={styles.legal}>
        Pièce d’identité et coordonnées bancaires sont collectées par Stripe, jamais par
        FightConnect.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...SHADOW,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    marginTop: SPACING.md,
    padding: SPACING.lg,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  title: { ...TYPOGRAPHY.subtitle, color: COLORS.text, flexShrink: 1 },
  body: { ...TYPOGRAPHY.body, color: COLORS.textMuted, lineHeight: 20 },
  action: { marginTop: SPACING.lg },
  legal: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: SPACING.md },
});

export default PayoutCard;
