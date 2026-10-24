import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useToast } from 'react-native-toast-notifications';

import Badge from '@/components/Badge';
import Button from '@/components/Button';
import EmptyState from '@/components/EmptyState';
import ErrorView from '@/components/ErrorView';
import LoadingSpinner from '@/components/LoadingSpinner';
import { COLORS, RADIUS, REPORT_REASON_LABELS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { safetyService } from '@/services/safety';
import { confirm } from '@/utils/confirm';
import { formatCount, formatRelative, formatUserName } from '@/utils/formatting';
import type { AppError, Report, ReportAction, ReportTargetType } from '@/types';

const TARGET_LABELS: Record<ReportTargetType, string> = {
  user: 'Profil',
  message: 'Message',
  announcement: 'Annonce',
  announcement_reply: 'Réponse à une annonce',
};

const RESOLUTION_LABELS: Record<ReportAction, string> = {
  dismiss: 'Classé',
  remove_content: 'Contenu retiré',
  suspend: 'Compte suspendu',
};

const ACTION_DONE: Record<ReportAction, string> = {
  dismiss: 'Signalement classé.',
  remove_content: 'Contenu retiré.',
  suspend: 'Compte suspendu.',
};

/**
 * Signalements, pour les administrateurs.
 *
 * Google Play attend qu'on agisse sur ce qui est signalé ; c'est ici. L'écran
 * n'apparaît dans le profil que pour un administrateur, et le serveur refuse
 * de toute façon ces appels à quiconque d'autre.
 */
export default function ReportsScreen() {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<'open' | 'resolved'>('open');
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setReports(await safetyService.reports(tab));
    } catch (caught) {
      setError(caught as AppError);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [tab]);

  useEffect(() => {
    setIsLoading(true);
    void load();
  }, [load]);

  const decide = async (report: Report, action: ReportAction) => {
    const name = formatUserName(report.reported);
    if (action !== 'dismiss') {
      const ok = await confirm(
        action === 'suspend'
          ? {
              title: `Suspendre ${name} ?`,
              message:
                'Le compte ne pourra plus se connecter et disparaîtra de l’application. ' +
                'Ses annonces seront closes. Vous pourrez lever la suspension.',
              confirmLabel: 'Suspendre',
              destructive: true,
            }
          : {
              title: 'Retirer ce contenu ?',
              message:
                report.targetType === 'user'
                  ? 'La présentation et les vidéos du profil seront effacées.'
                  : 'Le contenu sera supprimé définitivement.',
              confirmLabel: 'Retirer',
              destructive: true,
            },
      );
      if (!ok) return;
    }

    setBusy(report.id);
    try {
      await safetyService.resolve(report.id, action);
      toast.show(ACTION_DONE[action], { type: 'success' });
      // Une suspension règle aussi les autres signalements de la même personne.
      await load();
    } catch (caught) {
      toast.show((caught as AppError).message, { type: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  const unsuspend = async (report: Report) => {
    if (!report.reported) return;
    setBusy(report.id);
    try {
      await safetyService.unsuspend(report.reported.id);
      toast.show('Suspension levée.', { type: 'success' });
      await load();
    } catch (caught) {
      toast.show((caught as AppError).message, { type: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.segments}>
        {(['open', 'resolved'] as const).map((value) => {
          const active = value === tab;
          return (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setTab(value)}
              style={[styles.segment, active && styles.segmentActive]}
            >
              <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                {value === 'open' ? 'À traiter' : 'Traités'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <LoadingSpinner fullScreen label="Chargement des signalements…" />
      ) : error ? (
        <ErrorView error={error} onRetry={load} />
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
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
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.badges}>
                <Badge label={REPORT_REASON_LABELS[item.reason] ?? item.reason} tone="danger" />
                <Badge label={TARGET_LABELS[item.targetType]} tone="neutral" />
                {item.reportedSuspended && item.resolution !== 'suspend' ? (
                  <Badge label="Suspendu" tone="warning" />
                ) : null}
                {item.resolution ? (
                  <Badge label={RESOLUTION_LABELS[item.resolution]} tone="success" />
                ) : null}
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => item.reported && router.push(`/partner/${item.reported.id}`)}
              >
                <Text style={styles.reported}>{formatUserName(item.reported)}</Text>
                <Text style={styles.meta}>
                  {formatCount(
                    item.reportedOpenReports,
                    'signalement en attente',
                    'signalements en attente',
                  )}
                </Text>
              </Pressable>

              {item.excerpt ? (
                <View style={styles.excerpt}>
                  <Text style={styles.excerptText}>« {item.excerpt} »</Text>
                </View>
              ) : null}
              {item.details ? <Text style={styles.details}>{item.details}</Text> : null}
              <Text style={styles.meta}>
                Signalé par {formatUserName(item.reporter)}
                {item.createdAt ? ` · ${formatRelative(item.createdAt)}` : ''}
              </Text>

              {item.status === 'open' ? (
                <View style={styles.actions}>
                  <Button
                    label="Classer"
                    variant="outline"
                    onPress={() => void decide(item, 'dismiss')}
                    disabled={busy !== null}
                    loading={busy === item.id}
                    style={styles.action}
                  />
                  <Button
                    label="Retirer"
                    variant="secondary"
                    onPress={() => void decide(item, 'remove_content')}
                    disabled={busy !== null}
                    style={styles.action}
                  />
                  <Button
                    label="Suspendre"
                    variant="danger"
                    onPress={() => void decide(item, 'suspend')}
                    disabled={busy !== null}
                    style={styles.action}
                  />
                </View>
              ) : item.reportedSuspended ? (
                <Button
                  label="Lever la suspension"
                  variant="outline"
                  onPress={() => void unsuspend(item)}
                  loading={busy === item.id}
                  disabled={busy !== null}
                />
              ) : null}
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="shield-checkmark-outline"
              title={tab === 'open' ? 'Rien à traiter' : 'Aucun signalement traité'}
              message={
                tab === 'open'
                  ? 'Vous recevrez une notification au prochain signalement.'
                  : 'Les décisions prises apparaîtront ici.'
              }
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: COLORS.background, flex: 1 },
  segments: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    flexDirection: 'row',
    gap: SPACING.xs,
    margin: SPACING.lg,
    padding: SPACING.xs,
  },
  segment: { alignItems: 'center', borderRadius: RADIUS.md, flex: 1, paddingVertical: SPACING.sm },
  segmentActive: { backgroundColor: COLORS.primary },
  segmentLabel: { ...TYPOGRAPHY.body, color: COLORS.textMuted, fontWeight: '600' },
  segmentLabelActive: { color: COLORS.textInverse },
  list: { flexGrow: 1, gap: SPACING.md, paddingBottom: SPACING.xxl, paddingHorizontal: SPACING.lg },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    gap: SPACING.sm,
    padding: SPACING.lg,
  },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  reported: { ...TYPOGRAPHY.subtitle, color: COLORS.text },
  meta: { ...TYPOGRAPHY.caption, color: COLORS.textMuted },
  excerpt: {
    backgroundColor: COLORS.surfaceRaised,
    borderLeftColor: COLORS.error,
    borderLeftWidth: 3,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
  },
  excerptText: { ...TYPOGRAPHY.body, color: COLORS.text, lineHeight: 20 },
  details: { ...TYPOGRAPHY.body, color: COLORS.textMuted, fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
  action: { flex: 1 },
});
