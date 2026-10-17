import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import AnnouncementCard from '@/components/AnnouncementCard';
import EmptyState from '@/components/EmptyState';
import ErrorView from '@/components/ErrorView';
import LoadingSpinner from '@/components/LoadingSpinner';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { announcementService } from '@/services/announcement';
import { formatCount } from '@/utils/formatting';
import type { Announcement, AnnouncementKind, AppError } from '@/types';

type Segment = 'all' | AnnouncementKind | 'mine';

const SEGMENTS: { id: Segment; label: string }[] = [
  { id: 'all', label: 'Toutes' },
  { id: 'sparring', label: 'Sparring' },
  { id: 'fight', label: 'Combat' },
  { id: 'mine', label: 'Les miennes' },
];

const EMPTY: Record<Segment, { title: string; message: string }> = {
  all: {
    title: 'Aucune annonce',
    message: 'Personne ne cherche encore. Publiez la première : un sparring, un adversaire…',
  },
  sparring: {
    title: 'Aucune annonce de sparring',
    message: 'Publiez la vôtre : les partenaires disponibles pourront vous répondre.',
  },
  fight: {
    title: 'Aucune annonce de combat',
    message: 'Vous cherchez un adversaire pour un gala ? Publiez une annonce.',
  },
  mine: {
    title: 'Vous n’avez rien publié',
    message: 'Une annonce dit ce que vous cherchez ; les autres vous répondent.',
  },
};

export default function AnnouncementsScreen() {
  const router = useRouter();
  const [segment, setSegment] = useState<Segment>('all');
  const [items, setItems] = useState<Announcement[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      if (segment === 'mine') {
        const mine = await announcementService.mine();
        setItems(mine);
        setTotal(mine.length);
      } else {
        const result = await announcementService.list({
          filters: { kind: segment === 'all' ? null : segment },
        });
        setItems(result.items);
        setTotal(result.total);
      }
    } catch (caught) {
      setError(caught as AppError);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [segment]);

  // Au retour d'une annonce, le nombre de réponses ou son état ont pu changer.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const select = (next: Segment) => {
    if (next === segment) return;
    setIsLoading(true);
    setSegment(next);
  };

  const publish = () => router.push('/announcement/new');
  const open = useCallback(
    (announcement: Announcement) => router.push(`/announcement/${announcement.id}`),
    [router],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Annonces</Text>
          <Text style={styles.subtitle}>
            {segment === 'mine'
              ? formatCount(total, 'annonce publiée', 'annonces publiées')
              : formatCount(total, 'annonce en ligne', 'annonces en ligne')}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Publier une annonce"
          onPress={publish}
          style={({ pressed }) => [styles.publish, pressed && styles.pressed]}
          testID="announcement-publish"
        >
          <Ionicons name="add" size={20} color={COLORS.textInverse} />
          <Text style={styles.publishLabel}>Publier</Text>
        </Pressable>
      </View>

      <View style={styles.segments} accessibilityRole="tablist">
        {SEGMENTS.map((option) => {
          const active = option.id === segment;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => select(option.id)}
              style={[styles.segment, active && styles.segmentActive]}
            >
              <Text
                style={[styles.segmentLabel, active && styles.segmentLabelActive]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <LoadingSpinner fullScreen label="Chargement des annonces…" />
      ) : error ? (
        <ErrorView error={error} onRetry={load} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <AnnouncementCard announcement={item} onPress={open} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                setIsRefreshing(true);
                void load();
              }}
              tintColor={COLORS.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="megaphone-outline"
              title={EMPTY[segment].title}
              message={EMPTY[segment].message}
              actionLabel="Publier une annonce"
              onAction={publish}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: COLORS.background, flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  headerText: { flex: 1 },
  title: { ...TYPOGRAPHY.display, color: COLORS.text },
  subtitle: { ...TYPOGRAPHY.body, color: COLORS.textMuted, marginTop: 2 },
  publish: {
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    flexDirection: 'row',
    gap: SPACING.xs,
    minHeight: 44,
    paddingHorizontal: SPACING.lg,
  },
  publishLabel: { ...TYPOGRAPHY.button, color: COLORS.textInverse, fontSize: 15 },
  pressed: { opacity: 0.85 },
  segments: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    flexDirection: 'row',
    gap: SPACING.xs,
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.lg,
    padding: SPACING.xs,
  },
  // Largeur selon le libellé, puis partage de l'espace restant : à parts
  // égales, « Les miennes » était tronqué pendant que « Toutes » flottait.
  segment: {
    alignItems: 'center',
    borderRadius: RADIUS.md,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: SPACING.sm,
  },
  segmentActive: { backgroundColor: COLORS.primary },
  segmentLabel: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  segmentLabelActive: { color: COLORS.textInverse },
  list: { flexGrow: 1, paddingBottom: SPACING.xxl, paddingHorizontal: SPACING.lg },
});
