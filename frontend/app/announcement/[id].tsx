import React, { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useToast } from 'react-native-toast-notifications';

import { announcementWeight } from '@/components/AnnouncementCard';
import Avatar from '@/components/Avatar';
import Badge from '@/components/Badge';
import Button from '@/components/Button';
import ErrorView from '@/components/ErrorView';
import Input from '@/components/Input';
import LoadingSpinner from '@/components/LoadingSpinner';
import SafetySheet, { SafetyMenuButton } from '@/components/SafetySheet';
import { ANNOUNCEMENT_KIND_LABELS, COLORS, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { announcementService } from '@/services/announcement';
import { confirm } from '@/utils/confirm';
import {
  formatCount,
  formatDateTime,
  formatLevel,
  formatPrice,
  formatRelative,
  formatStyle,
  formatUserName,
} from '@/utils/formatting';
import { announcementReplySchema, validate } from '@/utils/validation';
import type {
  Announcement,
  AnnouncementReply,
  AppError,
  ReportSubject,
  UserSummary,
} from '@/types';

const PROVIDER_LABELS: Record<string, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
};

export default function AnnouncementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const headerHeight = useHeaderHeight();

  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | undefined>();
  const [busy, setBusy] = useState<'reply' | 'close' | 'delete' | null>(null);
  const [safety, setSafety] = useState<{ subject: ReportSubject; step: 'menu' | 'report' } | null>(
    null,
  );

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      setAnnouncement(await announcementService.detail(id));
    } catch (caught) {
      setError(caught as AppError);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const sendReply = useCallback(async () => {
    if (!announcement) return;
    const result = validate(announcementReplySchema, { message: draft });
    if (!result.data) {
      setDraftError(result.errors.message);
      return;
    }
    setDraftError(undefined);
    setBusy('reply');
    try {
      setAnnouncement(await announcementService.reply(announcement.id, result.data.message));
      setDraft('');
      toast.show('Réponse envoyée', { type: 'success' });
    } catch (caught) {
      toast.show((caught as AppError).message, { type: 'danger' });
    } finally {
      setBusy(null);
    }
  }, [announcement, draft, toast]);

  const close = useCallback(async () => {
    if (!announcement) return;
    const ok = await confirm({
      title: 'Annonce pourvue ?',
      message: 'Elle quittera la liste et n’acceptera plus de réponses. Vous gardez celles reçues.',
      confirmLabel: 'Marquer pourvue',
    });
    if (!ok) return;
    setBusy('close');
    try {
      setAnnouncement(await announcementService.close(announcement.id));
      toast.show('Annonce marquée comme pourvue', { type: 'success' });
    } catch (caught) {
      toast.show((caught as AppError).message, { type: 'danger' });
    } finally {
      setBusy(null);
    }
  }, [announcement, toast]);

  const remove = useCallback(async () => {
    if (!announcement) return;
    const ok = await confirm({
      title: 'Supprimer l’annonce ?',
      message: 'Elle disparaît avec toutes ses réponses. C’est définitif.',
      confirmLabel: 'Supprimer',
      destructive: true,
    });
    if (!ok) return;
    setBusy('delete');
    try {
      await announcementService.remove(announcement.id);
      toast.show('Annonce supprimée', { type: 'success' });
      router.back();
    } catch (caught) {
      toast.show((caught as AppError).message, { type: 'danger' });
      setBusy(null);
    }
  }, [announcement, router, toast]);

  if (isLoading) return <LoadingSpinner fullScreen label="Chargement de l’annonce…" />;
  if (error || !announcement) {
    return <ErrorView error={error ?? notFound()} onRetry={load} />;
  }

  const isFight = announcement.kind === 'fight';
  const closed = announcement.status === 'closed' || isExpired(announcement);
  const weight = announcementWeight(announcement);
  const author = announcement.author;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Sur l'annonce d'un autre : la signaler, ou bloquer son auteur. */}
      {!announcement.isMine && author ? (
        <Stack.Screen
          options={{
            headerRight: () => (
              <SafetyMenuButton
                onPress={() =>
                  setSafety({
                    subject: {
                      user: author,
                      targetType: 'announcement',
                      targetId: announcement.id,
                    },
                    step: 'menu',
                  })
                }
              />
            ),
          }}
        />
      ) : null}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={headerHeight}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.badges}>
            <Badge
              label={ANNOUNCEMENT_KIND_LABELS[announcement.kind] ?? announcement.kind}
              tone={isFight ? 'danger' : 'primary'}
              icon={isFight ? 'trophy-outline' : 'fitness-outline'}
            />
            <Badge label={formatStyle(announcement.style)} tone="neutral" />
            {announcement.level ? (
              <Badge label={formatLevel(announcement.level)} tone="secondary" />
            ) : null}
            {closed ? <Badge label="Pourvue" tone="success" icon="checkmark" /> : null}
          </View>

          <Text style={styles.message}>{announcement.message}</Text>

          <View style={styles.facts}>
            <Fact icon="location-outline" label="Ville" value={announcement.city} />
            <Fact
              icon="calendar-outline"
              label="Date"
              value={
                announcement.scheduledFor ? formatDateTime(announcement.scheduledFor) : 'À convenir'
              }
            />
            {weight ? <Fact icon="barbell-outline" label="Poids" value={weight} /> : null}
            {announcement.fighterName ? (
              <Fact icon="person-outline" label="Combattant" value={announcement.fighterName} />
            ) : null}
            {announcement.fighterRecord ? (
              <Fact icon="podium-outline" label="Palmarès" value={announcement.fighterRecord} />
            ) : null}
          </View>

          {announcement.videoUrl ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => {
                if (announcement.videoUrl)
                  Linking.openURL(announcement.videoUrl).catch(() => undefined);
              }}
              style={({ pressed }) => [styles.video, pressed && styles.pressed]}
            >
              <Ionicons name="play-circle" size={28} color={COLORS.primary} />
              <Text style={styles.videoLabel}>
                Voir la vidéo
                {announcement.videoProvider
                  ? ` sur ${PROVIDER_LABELS[announcement.videoProvider]}`
                  : ''}
              </Text>
              <Ionicons name="open-outline" size={16} color={COLORS.textMuted} />
            </Pressable>
          ) : null}

          {!announcement.isMine && author ? (
            <PersonRow
              person={author}
              caption="Publiée par"
              onPress={() => router.push(`/partner/${author.id}`)}
            />
          ) : null}

          {announcement.isMine ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {formatCount(announcement.repliesCount, 'réponse')}
              </Text>
              {announcement.replies && announcement.replies.length > 0 ? (
                announcement.replies.map((reply) => (
                  <ReplyCard
                    key={reply.id}
                    reply={reply}
                    onProfile={(person) => router.push(`/partner/${person.id}`)}
                    onWrite={(person) => router.push(`/chat/${person.id}`)}
                    onReport={(person) =>
                      setSafety({
                        subject: {
                          user: person,
                          targetType: 'announcement_reply',
                          targetId: reply.id,
                        },
                        step: 'menu',
                      })
                    }
                  />
                ))
              ) : (
                <Text style={styles.muted}>
                  Pas encore de réponse. Vous recevrez une notification dès qu’il y en aura une.
                </Text>
              )}

              <View style={styles.ownerActions}>
                {!closed ? (
                  <Button
                    label="Marquer comme pourvue"
                    variant="outline"
                    onPress={close}
                    loading={busy === 'close'}
                    disabled={busy !== null}
                  />
                ) : null}
                <Button
                  label="Supprimer l’annonce"
                  variant="ghost"
                  onPress={remove}
                  loading={busy === 'delete'}
                  disabled={busy !== null}
                  testID="announcement-delete"
                />
              </View>
            </View>
          ) : closed ? (
            <Notice
              icon="lock-closed-outline"
              text="Cette annonce est pourvue ou expirée : elle n’accepte plus de réponses."
            />
          ) : announcement.hasReplied ? (
            <View style={styles.section}>
              <Notice
                icon="checkmark-circle"
                tone="success"
                text="Vous avez répondu. L’auteur vous écrira dans Messages s’il retient votre proposition."
              />
              {author ? (
                <Button
                  label={`Écrire à ${author.firstName || 'l’auteur'}`}
                  variant="outline"
                  onPress={() => router.push(`/chat/${author.id}`)}
                />
              ) : null}
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Répondre</Text>
              <Input
                label="Votre message"
                value={draft}
                onChangeText={setDraft}
                placeholder={
                  isFight
                    ? 'Mon élève fait 70 kg, 5 combats, dispo à cette date…'
                    : 'Dispo jeudi, je fais 75 kg, niveau amateur…'
                }
                multiline
                maxLength={300}
                error={draftError}
                testID="announcement-reply"
              />
              <Button
                label="Envoyer ma réponse"
                onPress={sendReply}
                loading={busy === 'reply'}
                testID="announcement-reply-send"
              />
              <Text style={styles.muted}>
                Seul l’auteur voit votre réponse, avec votre profil et votre tarif.
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <SafetySheet
        visible={safety !== null}
        subject={safety?.subject ?? null}
        initialStep={safety?.step}
        isBlocked={false}
        onClose={() => setSafety(null)}
        onBlockChange={(blocked) => {
          if (!blocked) return;
          // L'auteur bloqué : son annonce n'existe plus pour nous. Une réponse
          // bloquée : elle disparaît de la liste, qu'on recharge.
          if (announcement.isMine) void load();
          else router.back();
        }}
      />
    </SafeAreaView>
  );
}

/** Une annonce peut expirer pendant qu'on la regarde : le serveur refuserait alors la réponse. */
function isExpired(announcement: Announcement): boolean {
  if (!announcement.expiresAt) return false;
  const time = Date.parse(announcement.expiresAt);
  return Number.isFinite(time) && time <= Date.now();
}

function notFound(): AppError {
  return { message: 'Annonce introuvable.', status: 404, isNetworkError: false, fieldErrors: null };
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={18} color={COLORS.primary} />
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function Notice({
  icon,
  text,
  tone = 'muted',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  tone?: 'muted' | 'success';
}) {
  const color = tone === 'success' ? COLORS.success : COLORS.textMuted;
  return (
    <View style={styles.notice}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.noticeText, { color }]}>{text}</Text>
    </View>
  );
}

function PersonRow({
  person,
  caption,
  onPress,
}: {
  person: UserSummary;
  caption: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Voir le profil de ${formatUserName(person)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.person, pressed && styles.pressed]}
    >
      <Avatar user={person} size={44} />
      <View style={styles.personText}>
        <Text style={styles.caption}>{caption}</Text>
        <Text style={styles.personName}>{formatUserName(person)}</Text>
        {person.city ? <Text style={styles.muted}>{person.city}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
    </Pressable>
  );
}

function ReplyCard({
  reply,
  onProfile,
  onWrite,
  onReport,
}: {
  reply: AnnouncementReply;
  onProfile: (person: UserSummary) => void;
  onWrite: (person: UserSummary) => void;
  onReport: (person: UserSummary) => void;
}) {
  const person = reply.author;
  return (
    <View style={styles.reply}>
      <View style={styles.replyHeader}>
        <Avatar user={person} size={40} />
        <View style={styles.personText}>
          <Text style={styles.personName}>{formatUserName(person)}</Text>
          <Text style={styles.muted}>
            {[person?.city, reply.createdAt ? formatRelative(reply.createdAt) : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        {person?.pricePerRound != null ? (
          <View style={styles.price}>
            <Text style={styles.priceValue}>{formatPrice(person.pricePerRound)}</Text>
            <Text style={styles.muted}>/round</Text>
          </View>
        ) : null}
        {person ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Signaler ou bloquer ${formatUserName(person)}`}
            onPress={() => onReport(person)}
            hitSlop={10}
          >
            <Ionicons name="ellipsis-vertical" size={18} color={COLORS.textMuted} />
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.replyMessage}>{reply.message}</Text>
      {person ? (
        <View style={styles.replyActions}>
          <Button
            label="Voir le profil"
            variant="outline"
            onPress={() => onProfile(person)}
            style={styles.flex}
          />
          <Button label="Écrire" onPress={() => onWrite(person)} style={styles.flex} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: COLORS.background, flex: 1 },
  flex: { flex: 1 },
  content: { gap: SPACING.lg, padding: SPACING.lg, paddingBottom: SPACING.xxl },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  message: { ...TYPOGRAPHY.body, color: COLORS.text, fontSize: 17, lineHeight: 25 },
  facts: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    gap: SPACING.md,
    padding: SPACING.lg,
  },
  fact: { alignItems: 'center', flexDirection: 'row', gap: SPACING.sm },
  factLabel: { ...TYPOGRAPHY.body, color: COLORS.textMuted, width: 92 },
  factValue: { ...TYPOGRAPHY.body, color: COLORS.text, flex: 1, fontWeight: '600' },
  video: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACING.md,
    padding: SPACING.md,
  },
  videoLabel: { ...TYPOGRAPHY.subtitle, color: COLORS.text, flex: 1 },
  pressed: { opacity: 0.85 },
  person: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    flexDirection: 'row',
    gap: SPACING.md,
    padding: SPACING.md,
  },
  personText: { flex: 1, gap: 2 },
  caption: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, textTransform: 'uppercase' },
  personName: { ...TYPOGRAPHY.subtitle, color: COLORS.text },
  muted: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, lineHeight: 18 },
  section: { gap: SPACING.md },
  sectionTitle: { ...TYPOGRAPHY.title, color: COLORS.text },
  ownerActions: { gap: SPACING.sm, marginTop: SPACING.sm },
  notice: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    flexDirection: 'row',
    gap: SPACING.md,
    padding: SPACING.md,
  },
  noticeText: { ...TYPOGRAPHY.body, flex: 1, lineHeight: 20 },
  reply: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    gap: SPACING.md,
    padding: SPACING.md,
  },
  replyHeader: { alignItems: 'center', flexDirection: 'row', gap: SPACING.md },
  price: { alignItems: 'flex-end' },
  priceValue: { ...TYPOGRAPHY.subtitle, color: COLORS.primary },
  replyMessage: { ...TYPOGRAPHY.body, color: COLORS.text, lineHeight: 20 },
  replyActions: { flexDirection: 'row', gap: SPACING.sm },
});
