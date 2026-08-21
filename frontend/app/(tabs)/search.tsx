import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import Button from '@/components/Button';
import EmptyState from '@/components/EmptyState';
import ErrorView from '@/components/ErrorView';
import LoadingSpinner from '@/components/LoadingSpinner';
import OfflineBanner from '@/components/OfflineBanner';
import PartnerCard from '@/components/PartnerCard';
import { COLORS, LEVEL_LABELS, RADIUS, SPACING, STYLE_LABELS, TYPOGRAPHY, WEIGHT_LABELS } from '@/constants/theme';
import { partnerService } from '@/services/partner';
import { useFilterStore } from '@/store/filters';
import type { AppError, Partner, SparringLevel, SparringStyle, WeightClass } from '@/types';

const STYLE_IDS = Object.keys(STYLE_LABELS) as SparringStyle[];
const LEVEL_IDS = Object.keys(LEVEL_LABELS) as SparringLevel[];
const WEIGHT_IDS = Object.keys(WEIGHT_LABELS) as WeightClass[];

export default function SearchScreen() {
  const router = useRouter();

  // Sélecteurs champ par champ : consommer le store entier re-rendrait l'écran
  // à chaque frappe, y compris pour des champs qu'il n'affiche pas.
  const city = useFilterStore((state) => state.city);
  const level = useFilterStore((state) => state.level);
  const style = useFilterStore((state) => state.style);
  const weightClass = useFilterStore((state) => state.weightClass);
  const setCity = useFilterStore((state) => state.setCity);
  const setLevel = useFilterStore((state) => state.setLevel);
  const setStyle = useFilterStore((state) => state.setStyle);
  const setWeightClass = useFilterStore((state) => state.setWeightClass);
  const reset = useFilterStore((state) => state.reset);

  const [partners, setPartners] = useState<Partner[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const filters = useMemo(
    () => ({ city, level, style, weightClass }),
    [city, level, style, weightClass],
  );

  const activeCount = [level, style, weightClass].filter((value) => value !== null).length;

  const load = useCallback(async () => {
    try {
      setError(null);
      const result = await partnerService.list({ filters });
      setPartners(result.items);
      setTotal(result.total);
      setFromCache(result.fromCache);
    } catch (caught) {
      setError(caught as AppError);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [filters]);

  useEffect(() => {
    setIsLoading(true);
    void load();
  }, [load]);

  // Revenir de la fiche d'un partenaire doit montrer un état à jour : une
  // disponibilité a pu changer entre-temps.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openPartner = useCallback(
    (partner: Partner) => router.push(`/partner/${partner.id}`),
    [router],
  );

  return (
    <SafeAreaView style={styles.safe}>
      <OfflineBanner visible={fromCache} />

      <View style={styles.header}>
        <Text style={styles.title}>Trouver un sparring</Text>
        <Text style={styles.subtitle}>
          {total} partenaire{total > 1 ? 's' : ''} disponible{total > 1 ? 's' : ''}
        </Text>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <Ionicons name="location-outline" size={18} color={COLORS.textMuted} />
          <TextInput
            value={city}
            onChangeText={setCity}
            placeholder="Rechercher par ville…"
            placeholderTextColor={COLORS.textMuted}
            style={styles.searchInput}
            autoCapitalize="words"
            testID="search-city"
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Filtres"
          onPress={() => setShowFilters(true)}
          style={styles.filterButton}
        >
          <Ionicons name="options-outline" size={20} color={COLORS.primary} />
          {activeCount > 0 ? (
            <View style={styles.filterCount}>
              <Text style={styles.filterCountText}>{activeCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {isLoading ? (
        <LoadingSpinner fullScreen label="Recherche des partenaires…" />
      ) : error ? (
        <ErrorView error={error} onRetry={load} />
      ) : (
        <FlatList
          data={partners}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <PartnerCard partner={item} onPress={openPartner} />}
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
              icon="people-outline"
              title="Aucun partenaire"
              message={
                activeCount > 0 || city
                  ? 'Élargissez vos critères : peu de monde correspond pour l’instant.'
                  : 'Personne n’est encore disponible. Complétez votre profil pour être le premier.'
              }
              actionLabel={activeCount > 0 || city ? 'Effacer les filtres' : undefined}
              onAction={
                activeCount > 0 || city
                  ? () => {
                      reset();
                    }
                  : undefined
              }
            />
          }
        />
      )}

      <Modal
        visible={showFilters}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowFilters(false)}
      >
        <SafeAreaView style={styles.safe}>
          <View style={styles.modalHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              onPress={() => setShowFilters(false)}
              hitSlop={12}
            >
              <Ionicons name="close" size={26} color={COLORS.text} />
            </Pressable>
            <Text style={styles.modalTitle}>Filtres</Text>
            <Pressable accessibilityRole="button" onPress={reset} hitSlop={12}>
              <Text style={styles.clear}>Effacer</Text>
            </Pressable>
          </View>

          <View style={styles.modalBody}>
            <ChipGroup
              label="Sport"
              options={STYLE_IDS}
              labels={STYLE_LABELS}
              selected={style}
              onSelect={(value) => setStyle(value as SparringStyle | null)}
            />
            <ChipGroup
              label="Catégorie de poids"
              options={WEIGHT_IDS}
              labels={WEIGHT_LABELS}
              selected={weightClass}
              onSelect={(value) => setWeightClass(value as WeightClass | null)}
            />
            <ChipGroup
              label="Niveau"
              options={LEVEL_IDS}
              labels={LEVEL_LABELS}
              selected={level}
              onSelect={(value) => setLevel(value as SparringLevel | null)}
            />
          </View>

          <View style={styles.modalFooter}>
            <Button
              label={`Voir ${total} résultat${total > 1 ? 's' : ''}`}
              onPress={() => setShowFilters(false)}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

interface ChipGroupProps {
  label: string;
  options: string[];
  labels: Record<string, string>;
  selected: string | null;
  onSelect: (value: string | null) => void;
}

function ChipGroup({ label, options, labels, selected, onSelect }: ChipGroupProps) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View style={styles.chips}>
        {options.map((option) => {
          const isActive = selected === option;
          return (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              // Réappuyer sur un filtre actif le retire : c'est le geste attendu,
              // et cela évite d'avoir à revenir sur « Effacer » pour un seul critère.
              onPress={() => onSelect(isActive ? null : option)}
              style={[styles.chip, isActive && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>
                {labels[option]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: COLORS.background, flex: 1 },
  header: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },
  title: { ...TYPOGRAPHY.display, color: COLORS.text },
  subtitle: { ...TYPOGRAPHY.body, color: COLORS.textMuted, marginTop: 2 },
  searchRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
  },
  searchField: {
    alignItems: 'center',
    backgroundColor: COLORS.surfaceRaised,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    minHeight: 50,
    paddingHorizontal: SPACING.md,
  },
  searchInput: { ...TYPOGRAPHY.body, color: COLORS.text, flex: 1, paddingVertical: SPACING.md },
  filterButton: {
    alignItems: 'center',
    backgroundColor: COLORS.surfaceRaised,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 50,
    width: 54,
  },
  filterCount: {
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    height: 18,
    justifyContent: 'center',
    position: 'absolute',
    right: 4,
    top: 4,
    width: 18,
  },
  filterCountText: { ...TYPOGRAPHY.caption, color: COLORS.textInverse, fontSize: 10, fontWeight: '700' },
  list: { paddingBottom: SPACING.xxl, paddingHorizontal: SPACING.lg },
  modalHeader: {
    alignItems: 'center',
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: SPACING.lg,
  },
  modalTitle: { ...TYPOGRAPHY.title, color: COLORS.text },
  clear: { ...TYPOGRAPHY.body, color: COLORS.primary, fontWeight: '600' },
  modalBody: { flex: 1, gap: SPACING.xl, padding: SPACING.lg },
  modalFooter: {
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    padding: SPACING.lg,
  },
  group: { gap: SPACING.sm },
  groupLabel: { ...TYPOGRAPHY.title, color: COLORS.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipLabel: { ...TYPOGRAPHY.body, color: COLORS.textMuted },
  chipLabelActive: { color: COLORS.textInverse, fontWeight: '600' },
});
