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
import { VideoAddSheet } from '@/components/VideoAddSheet';
import { VideoGallery } from '@/components/VideoGallery';
import {
  COLORS,
  LEVEL_LABELS,
  RADIUS,
  SHADOW,
  SPACING,
  STYLE_LABELS,
  TYPOGRAPHY,
  WEIGHT_LABELS,
} from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { payoutService } from '@/services/payout';
import { videoService } from '@/services/video';
import {
  formatLevel,
  formatPrice,
  formatStyle,
  formatUserName,
  formatWeightClass,
} from '@/utils/formatting';
import type { AppError, PayoutStatus, ProfileVideo, VideoKind } from '@/types';
import type { ProfileInput } from '@/utils/validation';

/**
 * React Native Web ignore `thumbColor` à l'état actif et repeint le curseur en
 * vert, ce qui jure avec la piste orange. `activeThumbColor` est la prop qu'il
 * lit — elle n'existe pas dans les types de React Native, d'où l'objet à part.
 */
const WEB_SWITCH_THUMB: Record<string, unknown> =
  Platform.OS === 'web' ? { activeThumbColor: COLORS.textInverse } : {};

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout, refreshUser, updateProfile } = useAuth();
  const { stats, isConnected, refreshStats } = useApp();
  const [isVideoSheetOpen, setVideoSheetOpen] = useState(false);
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

  /**
   * Ajoute une vidéo puis resynchronise le profil.
   *
   * La galerie n'est pas tenue localement : le serveur seul décide de l'ordre,
   * de la plateforme reconnue et de la vignette, et un état parallèle finirait
   * par diverger du sien.
   */
  const addVideo = useCallback(
    async (input: { url: string; kind: VideoKind; caption: string }) => {
      try {
        await videoService.add(input);
        await refreshUser();
        setVideoSheetOpen(false);
      } catch (caught) {
        // Le serveur explique quels liens il accepte : son message vaut mieux
        // qu'un « échec » générique.
        toast.show((caught as AppError).message, { type: 'danger' });
      }
    },
    [refreshUser, toast],
  );

  const removeVideo = useCallback(
    async (video: ProfileVideo) => {
      try {
        await videoService.remove(video.id);
        await refreshUser();
      } catch (caught) {
        toast.show((caught as AppError).message, { type: 'danger' });
      }
    },
    [refreshUser, toast],
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
    Alert.alert('Déconnexion', 'Voulez-vous vraiment vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: () => void logout() },
    ]);
  }, [logout]);

  if (!user) return <LoadingSpinner fullScreen label="Chargement du profil…" />;
  if (isLoading) return <LoadingSpinner fullScreen label="Chargement du profil…" />;

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
            accessibilityLabel="Messages"
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
            <RatingStars value={user.averageRating ?? 0} size={15} />
            <Text style={styles.ratingLabel}>
              {isNew ? 'Nouveau' : user.averageRating?.toFixed(1)}
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
            {user.available ? 'Disponible pour sparring' : 'En pause'}
          </Text>
          <Switch
            value={user.available}
            onValueChange={(value) => void toggleAvailable(value)}
            trackColor={{ true: COLORS.primary, false: COLORS.disabled }}
            thumbColor={COLORS.textInverse}
            {...WEB_SWITCH_THUMB}
          />
        </View>

        <Text style={styles.sectionTitle}>Informations sportives</Text>

        <ProfileField
          icon="pulse"
          label="Sport"
          value={user.style ? formatStyle(user.style) : null}
          kind="choice"
          options={STYLE_LABELS}
          current={user.style}
          onSave={(value) => save({ style: (value as ProfileInput['style']) ?? undefined })}
        />
        <ProfileField
          icon="barbell"
          label="Catégorie de poids"
          value={user.weightClass ? formatWeightClass(user.weightClass) : null}
          kind="choice"
          options={WEIGHT_LABELS}
          current={user.weightClass}
          onSave={(value) =>
            save({ weightClass: (value as ProfileInput['weightClass']) ?? undefined })
          }
        />
        <ProfileField
          icon="trophy"
          label="Niveau"
          value={user.level ? formatLevel(user.level) : null}
          kind="choice"
          options={LEVEL_LABELS}
          current={user.level}
          onSave={(value) => save({ level: (value as ProfileInput['level']) ?? undefined })}
        />
        <ProfileField
          icon="resize"
          label="Taille"
          value={user.heightCm ? String(user.heightCm) : null}
          suffix="cm"
          kind="number"
          current={user.heightCm}
          placeholder="178"
          onSave={(value) => save({ heightCm: (value as number) ?? undefined })}
        />
        <ProfileField
          icon="medal"
          label="Combats"
          value={String(user.fightsCount)}
          kind="number"
          current={user.fightsCount}
          placeholder="0"
          onSave={(value) => save({ fightsCount: (value as number) ?? 0 })}
        />
        <ProfileField
          icon="time"
          label="Expérience"
          value={String(user.experienceYears)}
          suffix={user.experienceYears > 1 ? 'ans' : 'an'}
          kind="number"
          current={user.experienceYears}
          placeholder="0"
          onSave={(value) => save({ experienceYears: (value as number) ?? 0 })}
        />

        <Text style={styles.sectionTitle}>En action</Text>
        <Text style={styles.sectionHint}>
          Facultatif. Une vidéo en dit plus sur ton niveau que n’importe quelle note.
        </Text>
        <VideoGallery
          videos={user.videos}
          onAdd={() => setVideoSheetOpen(true)}
          onRemove={(video) => void removeVideo(video)}
        />

        <Text style={styles.sectionTitle}>Localisation et tarif</Text>

        <ProfileField
          icon="location"
          label="Ville"
          value={user.city}
          current={user.city}
          placeholder="Valence"
          onSave={(value) => save({ city: (value as string) ?? '' })}
        />
        <ProfileField
          icon="cash"
          label="Prix par round"
          value={user.pricePerRound !== null ? formatPrice(user.pricePerRound, user.currency) : null}
          kind="number"
          current={user.pricePerRound}
          placeholder="20"
          onSave={(value) => save({ pricePerRound: (value as number) ?? undefined })}
        />

        <Text style={styles.sectionTitle}>Description</Text>
        <ProfileField
          icon="document-text"
          label="Présentation"
          value={user.bio}
          current={user.bio}
          multiline
          placeholder="Boxeur amateur, toujours prêt pour un bon sparring."
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
            label="Séances"
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
          label="Déconnexion"
          variant="danger"
          onPress={confirmLogout}
          style={styles.logout}
          icon={<Ionicons name="log-out-outline" size={18} color={COLORS.textInverse} />}
        />
      </ScrollView>

      <VideoAddSheet
        visible={isVideoSheetOpen}
        onClose={() => setVideoSheetOpen(false)}
        onSubmit={addVideo}
      />
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
  sectionHint: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginBottom: SPACING.md,
    marginTop: -SPACING.sm,
  },
  sectionTitle: {
    ...TYPOGRAPHY.title,
    color: COLORS.text,
    marginBottom: SPACING.md,
    marginTop: SPACING.xl,
  },
  statsRow: { flexDirection: 'row', gap: SPACING.sm },
  logout: { marginTop: SPACING.xl },
});
