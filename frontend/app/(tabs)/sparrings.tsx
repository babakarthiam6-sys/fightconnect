import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import Button from '@/components/Button';
import EmptyState from '@/components/EmptyState';
import ErrorView from '@/components/ErrorView';
import LoadingSpinner from '@/components/LoadingSpinner';
import OfflineBanner from '@/components/OfflineBanner';
import SparringCard from '@/components/SparringCard';
import { CONFIG } from '@/constants/config';
import { COLORS, LEVEL_LABELS, RADIUS, SPACING, STYLE_LABELS, TYPOGRAPHY } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { sparringService } from '@/services/sparring';
import { useFilterStore } from '@/store/filters';
import type { AppError, Sparring, SparringLevel, SparringStyle } from '@/types';

const LEVELS = Object.keys(LEVEL_LABELS) as SparringLevel[];
const STYLES_LIST = Object.keys(STYLE_LABELS) as SparringStyle[];
const PRICE_RANGES: { label: string; min: number | null; max: number | null }[] = [
  { label: 'Tous les prix', min: null, max: null },
  { label: 'Gratuit', min: 0, max: 0 },
  { label: 'Moins de 20 €', min: 0, max: 20 },
  { label: '20 – 50 €', min: 20, max: 50 },
  { label: 'Plus de 50 €', min: 50, max: null },
];

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

export default function SparringsScreen() {
  const router = useRouter();
  const { isConnected, sparringsVersion } = useApp();

  // Sélecteurs unitaires : consommer le store entier ferait changer d'identité
  // l'objet à chaque `set`, ce qui relancerait en boucle l'effet de recherche.
  const search = useFilterStore((state) => state.search);
  const levelFilter = useFilterStore((state) => state.level);
  const styleFilter = useFilterStore((state) => state.style);
  const minPrice = useFilterStore((state) => state.minPrice);
  const maxPrice = useFilterStore((state) => state.maxPrice);
  const setSearch = useFilterStore((state) => state.setSearch);
  const setLevel = useFilterStore((state) => state.setLevel);
  const setStyle = useFilterStore((state) => state.setStyle);
  const setPriceRange = useFilterStore((state) => state.setPriceRange);
  const resetStore = useFilterStore((state) => state.reset);

  const activeFilterCount = useMemo(
    () => [levelFilter, styleFilter, minPrice, maxPrice].filter((value) => value !== null).length,
    [levelFilter, styleFilter, minPrice, maxPrice],
  );

  const [items, setItems] = useState<Sparring[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState(search);

  const activeFilters = useMemo(
    () => ({ search, level: levelFilter, style: styleFilter, minPrice, maxPrice }),
    [search, levelFilter, styleFilter, minPrice, maxPrice],
  );

  // Debounce de la recherche : évite une requête par frappe.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(searchDraft.trim()), 400);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchDraft, setSearch]);

  const fetchPage = useCallback(
    async (targetPage: number, mode: 'replace' | 'append') => {
      try {
        const result = await sparringService.list({
          page: targetPage,
          limit: CONFIG.pageSize,
          filters: activeFilters,
        });

        setItems((previous) =>
          mode === 'append' ? [...previous, ...result.items] : result.items,
        );
        setPage(targetPage);
        setHasMore(result.hasMore && !result.fromCache);
        setFromCache(result.fromCache);
        setError(null);
      } catch (caught) {
        // Une pagination qui échoue ne doit pas effacer ce qui est déjà affiché.
        if (mode === 'replace') setItems([]);
        setError(caught as AppError);
      }
    },
    [activeFilters],
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    void fetchPage(1, 'replace').then(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchPage, sparringsVersion]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchPage(1, 'replace');
    setIsRefreshing(false);
  }, [fetchPage]);

  const handleEndReached = useCallback(async () => {
    if (isLoadingMore || !hasMore || isLoading) return;
    setIsLoadingMore(true);
    await fetchPage(page + 1, 'append');
    setIsLoadingMore(false);
  }, [fetchPage, hasMore, isLoading, isLoadingMore, page]);

  const openSparring = useCallback(
    (sparring: Sparring) => router.push(`/sparring/${sparring.id}`),
    [router],
  );

  const resetFilters = useCallback(() => {
    resetStore();
    setSearchDraft('');
  }, [resetStore]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <OfflineBanner visible={!isConnected || fromCache} />

      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color={COLORS.textMuted} />
          <TextInput
            value={searchDraft}
            onChangeText={setSearchDraft}
            placeholder="Rechercher un sparring, une ville…"
            placeholderTextColor={COLORS.textMuted}
            style={styles.searchInput}
            returnKeyType="search"
            testID="sparrings-search"
          />
          {searchDraft.length > 0 ? (
            <Pressable onPress={() => setSearchDraft('')} hitSlop={8} accessibilityLabel="Effacer">
              <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ouvrir les filtres"
          onPress={() => setIsFilterOpen(true)}
          style={styles.filterButton}
        >
          <Ionicons name="options-outline" size={20} color={COLORS.secondary} />
          {activeFilterCount > 0 ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {isLoading ? (
        <LoadingSpinner fullScreen label="Chargement des sparrings…" />
      ) : error && items.length === 0 ? (
        <ErrorView error={error} onRetry={() => void handleRefresh()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <SparringCard sparring={item} onPress={openSparring} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title="Aucun sparring trouvé"
              message={
                activeFilterCount > 0 || search
                  ? 'Essayez d’élargir vos critères de recherche.'
                  : 'Soyez le premier à proposer une séance.'
              }
              actionLabel={activeFilterCount > 0 ? 'Réinitialiser les filtres' : 'Créer un sparring'}
              onAction={
                activeFilterCount > 0 ? resetFilters : () => router.push('/sparring/create')
              }
            />
          }
          ListFooterComponent={isLoadingMore ? <LoadingSpinner size="small" /> : null}
        />
      )}

      <Modal
        visible={isFilterOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsFilterOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filtres</Text>
              <Pressable onPress={() => setIsFilterOpen(false)} hitSlop={10} accessibilityLabel="Fermer">
                <Ionicons name="close" size={22} color={COLORS.text} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.filterLabel}>Niveau</Text>
              <View style={styles.chipRow}>
                {LEVELS.map((level) => (
                  <Chip
                    key={level}
                    label={LEVEL_LABELS[level] ?? level}
                    active={levelFilter === level}
                    onPress={() => setLevel(levelFilter === level ? null : level)}
                  />
                ))}
              </View>

              <Text style={styles.filterLabel}>Discipline</Text>
              <View style={styles.chipRow}>
                {STYLES_LIST.map((style) => (
                  <Chip
                    key={style}
                    label={STYLE_LABELS[style] ?? style}
                    active={styleFilter === style}
                    onPress={() => setStyle(styleFilter === style ? null : style)}
                  />
                ))}
              </View>

              <Text style={styles.filterLabel}>Prix</Text>
              <View style={styles.chipRow}>
                {PRICE_RANGES.map((range) => (
                  <Chip
                    key={range.label}
                    label={range.label}
                    active={minPrice === range.min && maxPrice === range.max}
                    onPress={() => setPriceRange(range.min, range.max)}
                  />
                ))}
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <Button label="Réinitialiser" onPress={resetFilters} variant="ghost" />
              <Button label="Appliquer" onPress={() => setIsFilterOpen(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: COLORS.background, flex: 1 },
  toolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    height: 46,
    paddingHorizontal: SPACING.md,
  },
  searchInput: { ...TYPOGRAPHY.body, color: COLORS.text, flex: 1, height: '100%' },
  filterButton: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  filterBadge: {
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    height: 18,
    justifyContent: 'center',
    position: 'absolute',
    right: -4,
    top: -4,
    width: 18,
  },
  filterBadgeText: { ...TYPOGRAPHY.caption, color: COLORS.textInverse, fontSize: 10, fontWeight: '700' },
  list: { paddingBottom: SPACING.xxl, paddingHorizontal: SPACING.lg, paddingTop: SPACING.xs },
  modalOverlay: { backgroundColor: COLORS.overlay, flex: 1, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    maxHeight: '80%',
    padding: SPACING.xl,
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  modalTitle: { ...TYPOGRAPHY.title, color: COLORS.text },
  filterLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
    textTransform: 'uppercase',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.border,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipLabel: { ...TYPOGRAPHY.caption, color: COLORS.text },
  chipLabelActive: { color: COLORS.textInverse, fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.xl },
});
