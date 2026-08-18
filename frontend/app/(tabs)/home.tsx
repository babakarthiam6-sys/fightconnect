import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';

import Button from '@/components/Button';
import EmptyState from '@/components/EmptyState';
import LoadingSpinner from '@/components/LoadingSpinner';
import OfflineBanner from '@/components/OfflineBanner';
import SparringCard from '@/components/SparringCard';
import StatCard from '@/components/StatCard';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { moderationService } from '@/services/moderation';
import { sparringService } from '@/services/sparring';
import { formatPrice, formatRating } from '@/utils/formatting';
import type { Sparring } from '@/types';

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { stats, isConnected, refreshStats, sparringsVersion } = useApp();

  const [recent, setRecent] = useState<Sparring[]>([]);
  const [recommendations, setRecommendations] = useState<Sparring[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fromCache, setFromCache] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, recos] = await Promise.all([
        sparringService.list({ page: 1, limit: 6 }),
        moderationService.recommendations(),
      ]);
      setRecent(list.items);
      setFromCache(list.fromCache);
      setRecommendations(recos);
    } catch {
      // La liste reste vide : l'écran affiche son état vide plutôt qu'une erreur
      // bloquante, les statistiques restant utiles à elles seules.
      setRecent([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, sparringsVersion]);

  // Rafraîchit les compteurs au retour sur l'onglet (après un paiement, par ex.).
  useFocusEffect(
    useCallback(() => {
      void refreshStats();
    }, [refreshStats]),
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([load(), refreshStats()]);
    setIsRefreshing(false);
  }, [load, refreshStats]);

  const openSparring = useCallback(
    (sparring: Sparring) => router.push(`/sparring/${sparring.id}`),
    [router],
  );

  if (isLoading) {
    return <LoadingSpinner fullScreen label="Chargement de votre tableau de bord…" />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <OfflineBanner visible={!isConnected || fromCache} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.greeting}>Salut {user?.firstName || 'champion'} 👋</Text>
          <Text style={styles.subtitle}>Prêt pour votre prochaine séance ?</Text>
        </View>

        <View style={styles.statsRow}>
          <StatCard
            label="Gains totaux"
            value={formatPrice(stats?.totalEarnings ?? 0, stats?.currency)}
            icon="cash-outline"
            tint={COLORS.success}
          />
          <StatCard
            label="Sparrings"
            value={String(stats?.totalSparrings ?? 0)}
            icon="flame-outline"
            tint={COLORS.primary}
          />
          <StatCard
            label="Note moyenne"
            value={formatRating(stats?.averageRating)}
            icon="star-outline"
            tint={COLORS.accent}
          />
        </View>

        <Button
          label="Créer un sparring"
          onPress={() => router.push('/sparring/create')}
          icon={<Ionicons name="add-circle-outline" size={18} color={COLORS.textInverse} />}
          style={styles.cta}
        />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Sparrings récents</Text>
          <Text style={styles.sectionLink} onPress={() => router.push('/(tabs)/sparrings')}>
            Tout voir
          </Text>
        </View>

        {recent.length === 0 ? (
          <EmptyState
            icon="flame-outline"
            title="Aucun sparring pour le moment"
            message="Créez la première séance et invitez la communauté."
            actionLabel="Créer un sparring"
            onAction={() => router.push('/sparring/create')}
          />
        ) : (
          <FlatList
            horizontal
            data={recent}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <SparringCard sparring={item} onPress={openSparring} compact />}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carousel}
          />
        )}

        {recommendations.length > 0 ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recommandé pour vous</Text>
              <Ionicons name="sparkles-outline" size={16} color={COLORS.accent} />
            </View>
            <FlatList
              horizontal
              data={recommendations}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <SparringCard sparring={item} onPress={openSparring} compact />}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carousel}
            />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: COLORS.background, flex: 1 },
  content: { paddingBottom: SPACING.xxl, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },
  header: { marginBottom: SPACING.lg },
  greeting: { ...TYPOGRAPHY.headline, color: COLORS.secondary },
  subtitle: { ...TYPOGRAPHY.body, color: COLORS.textMuted, marginTop: SPACING.xs },
  statsRow: { flexDirection: 'row', gap: SPACING.md },
  cta: { marginTop: SPACING.lg },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
    marginTop: SPACING.xl,
  },
  sectionTitle: { ...TYPOGRAPHY.title, color: COLORS.text },
  sectionLink: { ...TYPOGRAPHY.body, color: COLORS.primary, fontWeight: '600' },
  carousel: { paddingRight: SPACING.lg },
});
