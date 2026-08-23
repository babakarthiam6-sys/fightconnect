import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
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
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { LEVEL_IDS, STYLE_IDS, WEIGHT_IDS } from '@/constants/sports';
import { useI18n, type Traducteur } from '@/i18n';
import { optionsPays } from '@/i18n/pays';
import { partnerService } from '@/services/partner';
import { useFilterStore } from '@/store/filters';
import type { AppError, Partner, SparringLevel, SparringStyle, WeightClass } from '@/types';


export default function SearchScreen() {
  const { t, locale } = useI18n();
  const router = useRouter();

  // Sélecteurs champ par champ : consommer le store entier re-rendrait l'écran
  // à chaque frappe, y compris pour des champs qu'il n'affiche pas.
  const city = useFilterStore((state) => state.city);
  const country = useFilterStore((state) => state.country);
  const level = useFilterStore((state) => state.level);
  const style = useFilterStore((state) => state.style);
  const weightClass = useFilterStore((state) => state.weightClass);
  const setCity = useFilterStore((state) => state.setCity);
  const setCountry = useFilterStore((state) => state.setCountry);
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
    () => ({ city, country, level, style, weightClass }),
    [city, country, level, style, weightClass],
  );

  const activeCount = [country, level, style, weightClass].filter((v) => v !== null).length;

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
        <Text style={styles.title}>{t('recherche.titre')}</Text>
        <Text style={styles.subtitle}>
          {t(total > 1 ? 'recherche.disponiblesPluriel' : 'recherche.disponibles', { n: total })}
        </Text>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <Ionicons name="location-outline" size={18} color={COLORS.textMuted} />
          <TextInput
            value={city}
            onChangeText={setCity}
            placeholder={t('recherche.ville')}
            placeholderTextColor={COLORS.textMuted}
            style={styles.searchInput}
            autoCapitalize="words"
            testID="search-city"
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('recherche.filtres')}
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
        <LoadingSpinner fullScreen label={t('recherche.chargement')} />
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
              title={t('recherche.aucun')}
              message={
                activeCount > 0 || city
                  ? t('recherche.aucunAvecFiltres')
                  : t('recherche.aucunSansFiltre')
              }
              actionLabel={activeCount > 0 || city ? t('recherche.effacer') : undefined}
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
              accessibilityLabel={t('general.fermer')}
              onPress={() => setShowFilters(false)}
              hitSlop={12}
            >
              <Ionicons name="close" size={26} color={COLORS.text} />
            </Pressable>
            <Text style={styles.modalTitle}>{t('recherche.filtres')}</Text>
            <Pressable accessibilityRole="button" onPress={reset} hitSlop={12}>
              <Text style={styles.clear}>Effacer</Text>
            </Pressable>
          </View>

          <View style={styles.modalBody}>
            {/*
              Le pays passe avant la discipline : c'est le filtre qui décide si
              les autres ont un sens. Il est en liste déroulante et non en puces
              — deux cent quarante-neuf pays ne tiennent pas à l'écran.
            */}
            <PaysChoisi
              label={t('recherche.pays')}
              tous={t('recherche.toutPays')}
              locale={locale}
              selected={country}
              onSelect={setCountry}
            />
            <ChipGroup
              label={t('recherche.sport')}
              prefixe="sport"
              options={STYLE_IDS}
              selected={style}
              onSelect={(value) => setStyle(value as SparringStyle | null)}
              t={t}
            />
            <ChipGroup
              label={t('recherche.poids')}
              prefixe="poids"
              options={WEIGHT_IDS}
              selected={weightClass}
              onSelect={(value) => setWeightClass(value as WeightClass | null)}
              t={t}
            />
            <ChipGroup
              label={t('recherche.niveau')}
              prefixe="niveau"
              options={LEVEL_IDS}
              selected={level}
              onSelect={(value) => setLevel(value as SparringLevel | null)}
              t={t}
            />
          </View>

          <View style={styles.modalFooter}>
            <Button
              label={t('recherche.voirResultats', { n: total })}
              onPress={() => setShowFilters(false)}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

/**
 * Choix du pays, en liste déroulante filtrable.
 *
 * Les noms viennent d'`Intl.DisplayNames`, donc traduits par le système :
 * recopier deux cent quarante-neuf pays dans le catalogue reviendrait à
 * maintenir une table qui vieillit, pour un résultat moins bon.
 */
function PaysChoisi({
  label,
  tous,
  locale,
  selected,
  onSelect,
}: {
  label: string;
  tous: string;
  locale: string;
  selected: string | null;
  onSelect: (code: string | null) => void;
}) {
  const [ouvert, setOuvert] = React.useState(false);
  const [filtre, setFiltre] = React.useState('');
  const pays = React.useMemo(() => optionsPays(locale), [locale]);
  const visibles = Object.entries(pays).filter(([, nom]) =>
    nom.toLowerCase().includes(filtre.trim().toLowerCase()),
  );

  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setOuvert((v) => !v)}
        style={[styles.chip, selected ? styles.chipActive : null]}
      >
        <Text style={[styles.chipLabel, selected ? styles.chipLabelActive : null]}>
          {selected ? (pays[selected] ?? selected) : tous}
        </Text>
      </Pressable>

      {ouvert ? (
        <>
          <TextInput
            value={filtre}
            onChangeText={setFiltre}
            placeholder={tous}
            placeholderTextColor={COLORS.textMuted}
            style={styles.paysRecherche}
          />
          <ScrollView style={styles.paysListe} keyboardShouldPersistTaps="handled">
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onSelect(null);
                setOuvert(false);
              }}
              style={styles.paysLigne}
            >
              <Text style={styles.chipLabel}>{tous}</Text>
            </Pressable>
            {visibles.map(([code, nom]) => (
              <Pressable
                key={code}
                accessibilityRole="button"
                accessibilityState={{ selected: selected === code }}
                onPress={() => {
                  onSelect(code);
                  setOuvert(false);
                }}
                style={styles.paysLigne}
              >
                <Text style={selected === code ? styles.chipLabelActive : styles.chipLabel}>
                  {nom}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}
    </View>
  );
}

interface ChipGroupProps {
  label: string;
  /** Préfixe de la clé de traduction : « sport », « poids » ou « niveau ». */
  prefixe: 'sport' | 'poids' | 'niveau';
  options: readonly string[];
  selected: string | null;
  onSelect: (value: string | null) => void;
  t: Traducteur;
}

function ChipGroup({ label, prefixe, options, selected, onSelect, t }: ChipGroupProps) {
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
                {t(`${prefixe}.${option}` as Parameters<Traducteur>[0])}
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
  paysRecherche: {
    ...TYPOGRAPHY.body,
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    color: COLORS.text,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  paysListe: { marginTop: SPACING.sm, maxHeight: 220 },
  paysLigne: { paddingVertical: SPACING.sm },
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
