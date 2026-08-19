import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import Button from '@/components/Button';
import EmptyState from '@/components/EmptyState';
import LoadingSpinner from '@/components/LoadingSpinner';
import PayoutCard from '@/components/PayoutCard';
import OfflineBanner from '@/components/OfflineBanner';
import SparringCard from '@/components/SparringCard';
import StatCard from '@/components/StatCard';
import UserProfile from '@/components/UserProfile';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { moderationService } from '@/services/moderation';
import { payoutService } from '@/services/payout';
import { sparringService } from '@/services/sparring';
import { formatPrice, formatRating } from '@/utils/formatting';
import type { PayoutStatus, Sparring, UserRiskProfile } from '@/types';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout, refreshUser } = useAuth();
  const { stats, isConnected, refreshStats, sparringsVersion } = useApp();

  const [mySparrings, setMySparrings] = useState<Sparring[]>([]);
  const [risk, setRisk] = useState<UserRiskProfile | null>(null);
  const [payouts, setPayouts] = useState<PayoutStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [list, riskProfile, payoutStatus] = await Promise.all([
        sparringService.list({ page: 1, limit: 50, creatorId: user.id }),
        moderationService.userRisk(user.id),
        payoutService.status(),
      ]);
      setMySparrings(list.items);
      setRisk(riskProfile);
      setPayouts(payoutStatus);
    } catch {
      setMySparrings([]);
    }
  }, [user]);

  useEffect(() => {
    void load().finally(() => setIsLoading(false));
  }, [load, sparringsVersion]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([load(), refreshStats(), refreshUser()]);
    setIsRefreshing(false);
  }, [load, refreshStats, refreshUser]);

  const confirmLogout = useCallback(() => {
    Alert.alert('Déconnexion', 'Voulez-vous vraiment vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: () => void logout() },
    ]);
  }, [logout]);

  if (!user) return <LoadingSpinner fullScreen />;
  if (isLoading) return <LoadingSpinner fullScreen label="Chargement de votre profil…" />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <OfflineBanner visible={!isConnected} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
        }
      >
        <UserProfile user={user} riskProfile={risk} />

        {payouts ? <PayoutCard status={payouts} onChanged={() => void load()} /> : null}

        <View style={styles.statsRow}>
          <StatCard
            label="Gains totaux"
            value={formatPrice(stats?.totalEarnings ?? 0, stats?.currency)}
            icon="cash-outline"
            tint={COLORS.success}
          />
          <StatCard
            label="Solde"
            value={formatPrice(stats?.balance ?? 0, stats?.currency)}
            icon="wallet-outline"
            tint={COLORS.secondary}
          />
        </View>

        <View style={styles.statsRow}>
          <StatCard
            label="Sparrings terminés"
            value={String(stats?.completedSparrings ?? 0)}
            icon="checkmark-done-outline"
            tint={COLORS.primary}
          />
          <StatCard
            label="Note moyenne"
            value={formatRating(stats?.averageRating ?? user.averageRating)}
            icon="star-outline"
            tint={COLORS.accent}
          />
        </View>

        <Text style={styles.sectionTitle}>Mes sparrings</Text>

        {mySparrings.length === 0 ? (
          <EmptyState
            icon="flame-outline"
            title="Vous n’avez rien créé"
            message="Proposez une séance pour commencer à générer des revenus."
            actionLabel="Créer un sparring"
            onAction={() => router.push('/sparring/create')}
          />
        ) : (
          mySparrings.map((sparring) => (
            <SparringCard
              key={sparring.id}
              sparring={sparring}
              onPress={(item) => router.push(`/sparring/${item.id}`)}
            />
          ))
        )}

        <Button
          label="Se déconnecter"
          onPress={confirmLogout}
          variant="danger"
          style={styles.logout}
          testID="profile-logout"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: COLORS.background, flex: 1 },
  content: { paddingBottom: SPACING.xxl, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },
  statsRow: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.md },
  sectionTitle: { ...TYPOGRAPHY.title, color: COLORS.text, marginBottom: SPACING.md, marginTop: SPACING.xl },
  logout: { marginTop: SPACING.xl },
});
