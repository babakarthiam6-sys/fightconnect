import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useToast } from 'react-native-toast-notifications';

import Avatar from '@/components/Avatar';
import Button from '@/components/Button';
import LoadingSpinner from '@/components/LoadingSpinner';
import OfflineBanner from '@/components/OfflineBanner';
import PayoutCard from '@/components/PayoutCard';
import ProfileField from '@/components/ProfileField';
import RatingStars from '@/components/RatingStars';
import StatCard from '@/components/StatCard';
import {
  COLORS,
  RADIUS,
  SHADOW,
  SPACING,
  TYPOGRAPHY,
} from '@/constants/theme';
import { LEVEL_IDS, STYLE_IDS, WEIGHT_IDS } from '@/constants/sports';
import { NOMS_DE_LANGUE, useI18n, type Langue } from '@/i18n';
import { nomDuPays, optionsDevise, optionsPays } from '@/i18n/pays';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { payoutService } from '@/services/payout';
import {
  formatLevel,
  formatPrice,
  formatRating,
  formatStyle,
  formatUserName,
  formatWeightClass,
} from '@/utils/formatting';
import type { AppError, PayoutStatus } from '@/types';
import type { ProfileInput } from '@/utils/validation';

/**
 * React Native Web ignore `thumbColor` à l'état actif et repeint le curseur en
 * vert, ce qui jure avec la piste orange. `activeThumbColor` est la prop qu'il
 * lit — elle n'existe pas dans les types de React Native, d'où l'objet à part.
 */
const WEB_SWITCH_THUMB: Record<string, unknown> =
  Platform.OS === 'web' ? { activeThumbColor: COLORS.textInverse } : {};

/** Table `identifiant → libellé traduit`, attendue par la feuille de choix. */
function optionsTraduites(
  ids: readonly string[],
  prefixe: string,
  t: (cle: never) => string,
): Record<string, string> {
  return Object.fromEntries(ids.map((id) => [id, t(`${prefixe}.${id}` as never)]));
}

export default function ProfileScreen() {
  const { t, langue, changerLangue, locale } = useI18n();
  const choix = (ids: readonly string[], prefixe: string) =>
    optionsTraduites(ids, prefixe, t as never);
  const router = useRouter();
  const { user, logout, refreshUser, updateProfile } = useAuth();
  const { stats, isConnected, refreshStats } = useApp();
  const toast = useToast();

  const [payouts, setPayouts] = useState<PayoutStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setPayouts(await payoutService.status());
    } catch {
      // Les versements sont un complément : leur absence ne doit pas vider
      // l'écran de profil.
      setPayouts(null);
    }
  }, []);

  useEffect(() => {
    void load().finally(() => setIsLoading(false));
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([load(), refreshStats(), refreshUser()]);
    setIsRefreshing(false);
  }, [load, refreshStats, refreshUser]);

  /** Enregistre un champ et remonte l'erreur du serveur telle quelle. */
  const save = useCallback(
    async (changes: ProfileInput) => {
      try {
        await updateProfile(changes);
      } catch (caught) {
        toast.show((caught as AppError).message, { type: 'danger' });
        throw caught;
      }
    },
    [toast, updateProfile],
  );

  const toggleAvailable = useCallback(
    async (available: boolean) => {
      try {
        await updateProfile({ available });
      } catch (caught) {
        // Le serveur refuse la disponibilité tant que discipline et tarif
        // manquent : son message dit exactement quoi remplir.
        toast.show((caught as AppError).message, { type: 'danger' });
      }
    },
    [toast, updateProfile],
  );

  const confirmLogout = useCallback(() => {
    Alert.alert(t('profil.deconnexion'), t('profil.deconnexionConfirme'), [
      { text: t('general.annuler'), style: 'cancel' },
      { text: t('profil.seDeconnecter'), style: 'destructive', onPress: () => void logout() },
    ]);
  }, [t, logout]);

  if (!user) return <LoadingSpinner fullScreen label={t('profil.chargement')} />;
  if (isLoading) return <LoadingSpinner fullScreen label={t('profil.chargement')} />;

  const isNew = user.ratingsCount === 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <OfflineBanner visible={!isConnected} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        <View style={styles.titleRow}>
          <Text style={styles.title}>Mon profil</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('discussion.titre')}
            onPress={() => router.push('/chat')}
            style={({ pressed }) => [styles.messages, pressed && styles.pressed]}
          >
            <Ionicons name="chatbubbles" size={22} color={COLORS.primary} />
          </Pressable>
        </View>

        <View style={styles.header}>
          <Avatar user={user} size={112} />
          <Text style={styles.name}>{formatUserName(user)}</Text>
          <Text style={styles.email}>{user.email}</Text>

          <View style={styles.ratingRow}>
            <RatingStars
              value={user.averageRating ?? 0}
              size={15}
              ratingsCount={user.ratingsCount}
            />
            <Text style={styles.ratingLabel}>
              {isNew ? t('profil.nouveau') : formatRating(user.averageRating)}
            </Text>
            <Text style={styles.meta}>({user.ratingsCount} avis)</Text>
          </View>
        </View>

        <View style={styles.availability}>
          <Ionicons
            name={user.available ? 'checkmark-circle' : 'pause-circle-outline'}
            size={22}
            color={user.available ? COLORS.success : COLORS.textMuted}
          />
          <Text style={styles.availabilityLabel}>
            {user.available ? t('profil.disponible') : t('profil.enPause')}
          </Text>
          <Switch
            value={user.available}
            onValueChange={(value) => void toggleAvailable(value)}
            trackColor={{ true: COLORS.primary, false: COLORS.disabled }}
            thumbColor={COLORS.textInverse}
            {...WEB_SWITCH_THUMB}
          />
        </View>

        <Text style={styles.sectionTitle}>{t('profil.infosSportives')}</Text>

        <ProfileField
          icon="pulse"
          label={t('profil.sport')}
          value={formatStyle(user.style, t)}
          kind="choice"
          options={choix(STYLE_IDS, 'sport')}
          current={user.style}
          onSave={(value) => save({ style: (value as ProfileInput['style']) ?? undefined })}
        />
        <ProfileField
          icon="barbell"
          label={t('profil.poids')}
          value={formatWeightClass(user.weightClass, t)}
          kind="choice"
          options={choix(WEIGHT_IDS, 'poids')}
          current={user.weightClass}
          onSave={(value) =>
            save({ weightClass: (value as ProfileInput['weightClass']) ?? undefined })
          }
        />
        <ProfileField
          icon="trophy"
          label={t('profil.niveau')}
          value={formatLevel(user.level, t)}
          kind="choice"
          options={choix(LEVEL_IDS, 'niveau')}
          current={user.level}
          onSave={(value) => save({ level: (value as ProfileInput['level']) ?? undefined })}
        />
        <ProfileField
          icon="resize"
          label={t('profil.taille')}
          value={user.heightCm ? String(user.heightCm) : null}
          suffix="cm"
          kind="number"
          current={user.heightCm}
          placeholder="178"
          onSave={(value) => save({ heightCm: (value as number) ?? undefined })}
        />
        <ProfileField
          icon="medal"
          label={t('profil.combats')}
          value={String(user.fightsCount)}
          kind="number"
          current={user.fightsCount}
          placeholder="0"
          onSave={(value) => save({ fightsCount: (value as number) ?? 0 })}
        />
        <ProfileField
          icon="time"
          label={t('profil.experience')}
          value={String(user.experienceYears)}
          suffix={user.experienceYears > 1 ? 'ans' : 'an'}
          kind="number"
          current={user.experienceYears}
          placeholder="0"
          onSave={(value) => save({ experienceYears: (value as number) ?? 0 })}
        />

        <Text style={styles.sectionTitle}>Localisation et tarif</Text>

        <ProfileField
          icon="location"
          label={t('profil.ville')}
          value={user.city}
          current={user.city}
          placeholder="Valence"
          onSave={(value) => save({ city: (value as string) ?? '' })}
        />
        <ProfileField
          icon="flag"
          label={t('profil.pays')}
          value={nomDuPays(user.country, locale)}
          kind="choice"
          options={optionsPays(locale)}
          current={user.country}
          onSave={(value) => save({ country: (value as string) ?? undefined })}
        />
        <ProfileField
          icon="swap-horizontal"
          label={t('profil.devise')}
          value={user.currency}
          kind="choice"
          options={optionsDevise(locale)}
          current={user.currency}
          onSave={(value) => save({ currency: (value as string) ?? undefined })}
        />
        <ProfileField
          icon="language"
          label={t('profil.langue')}
          value={NOMS_DE_LANGUE[langue]}
          kind="choice"
          options={NOMS_DE_LANGUE}
          current={langue}
          // La langue ne part pas au serveur : elle vit sur l'appareil, et
          // c'est l'en-tête `Accept-Language` qui la lui annonce à chaque appel.
          onSave={async (value) => {
            if (value) changerLangue(value as Langue);
          }}
        />
        <ProfileField
          icon="cash"
          label={t('profil.tarif')}
          value={user.pricePerRound !== null ? formatPrice(user.pricePerRound, user.currency) : null}
          kind="number"
          current={user.pricePerRound}
          placeholder="20"
          onSave={(value) => save({ pricePerRound: (value as number) ?? undefined })}
        />

        <Text style={styles.sectionTitle}>Description</Text>
        <ProfileField
          icon="document-text"
          label={t('profil.presentation')}
          value={user.bio}
          current={user.bio}
          multiline
          placeholder={t('profil.presentationExemple')}
          onSave={(value) => save({ bio: (value as string) ?? '' })}
        />

        <Text style={styles.sectionTitle}>Mes revenus</Text>
        <View style={styles.statsRow}>
          <StatCard
            label="Gains"
            value={formatPrice(stats?.totalEarnings ?? 0, stats?.currency)}
            icon="cash-outline"
            tint={COLORS.success}
          />
          <StatCard
            label={t('profil.seances')}
            value={String(stats?.completedBookings ?? 0)}
            icon="checkmark-done-outline"
          />
          <StatCard
            label="Demandes"
            value={String(stats?.totalBookings ?? 0)}
            icon="calendar-outline"
            tint={COLORS.secondary}
          />
        </View>

        {payouts ? <PayoutCard status={payouts} onChanged={load} /> : null}

        <Button
          label={t('profil.deconnexion')}
          variant="danger"
          onPress={confirmLogout}
          style={styles.logout}
          icon={<Ionicons name="log-out-outline" size={18} color={COLORS.textInverse} />}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: COLORS.background, flex: 1 },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  titleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  title: { ...TYPOGRAPHY.display, color: COLORS.text },
  messages: {
    alignItems: 'center',
    backgroundColor: COLORS.primarySoft,
    borderRadius: RADIUS.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  pressed: { opacity: 0.85 },
  header: { alignItems: 'center', gap: SPACING.xs, marginVertical: SPACING.xl },
  name: { ...TYPOGRAPHY.headline, color: COLORS.text, marginTop: SPACING.md },
  email: { ...TYPOGRAPHY.body, color: COLORS.textMuted },
  ratingRow: { alignItems: 'center', flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
  ratingLabel: { ...TYPOGRAPHY.subtitle, color: COLORS.text },
  meta: { ...TYPOGRAPHY.caption, color: COLORS.textMuted },
  availability: {
    ...SHADOW,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    flexDirection: 'row',
    gap: SPACING.md,
    padding: SPACING.lg,
  },
  availabilityLabel: { ...TYPOGRAPHY.body, color: COLORS.text, flex: 1, fontSize: 15 },
  sectionTitle: {
    ...TYPOGRAPHY.title,
    color: COLORS.text,
    marginBottom: SPACING.md,
    marginTop: SPACING.xl,
  },
  statsRow: { flexDirection: 'row', gap: SPACING.sm },
  logout: { marginTop: SPACING.xl },
});
