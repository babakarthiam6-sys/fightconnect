import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import Avatar from '@/components/Avatar';
import EmptyState from '@/components/EmptyState';
import ErrorView from '@/components/ErrorView';
import LoadingSpinner from '@/components/LoadingSpinner';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useT } from '@/i18n';
import { chatService } from '@/services/chat';
import { formatRelative, formatUserName } from '@/utils/formatting';
import type { AppError, Conversation } from '@/types';

export default function ConversationsScreen() {
  const t = useT();
  const router = useRouter();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setConversations(await chatService.conversations());
    } catch (caught) {
      setError(caught as AppError);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Revenir d'un fil doit remettre le compteur de non-lus à jour.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (isLoading) return <LoadingSpinner fullScreen label={t('discussion.chargement')} />;

  return (
    <SafeAreaView style={styles.safe}>
      {error ? (
        <ErrorView error={error} onRetry={load} />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('discussion.avec', { nom: formatUserName(item.other) })}
              onPress={() => item.other && router.push(`/chat/${item.other.id}`)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Avatar user={item.other} size={48} />

              <View style={styles.body}>
                <View style={styles.headerRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {formatUserName(item.other)}
                  </Text>
                  <Text style={styles.time}>{formatRelative(item.lastMessageAt)}</Text>
                </View>
                <Text
                  style={[styles.preview, item.unread > 0 && styles.previewUnread]}
                  numberOfLines={1}
                >
                  {item.lastMessage}
                </Text>
              </View>

              {item.unread > 0 ? (
                <View style={styles.pastille}>
                  <Text style={styles.pastilleTexte}>{item.unread}</Text>
                </View>
              ) : null}
            </Pressable>
          )}
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
              icon="chatbubbles-outline"
              title={t('discussion.aucun')}
              message={t('discussion.aucunTexte')}
              actionLabel={t('discussion.trouverPartenaire')}
              onAction={() => router.push('/(tabs)/search')}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: COLORS.background, flex: 1 },
  list: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  row: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
    padding: SPACING.lg,
  },
  pressed: { opacity: 0.85 },
  body: { flex: 1, gap: 2 },
  headerRow: { alignItems: 'baseline', flexDirection: 'row', gap: SPACING.sm },
  name: { ...TYPOGRAPHY.subtitle, color: COLORS.text, flex: 1 },
  time: { ...TYPOGRAPHY.caption, color: COLORS.textMuted },
  preview: { ...TYPOGRAPHY.body, color: COLORS.textMuted },
  previewUnread: { color: COLORS.text, fontWeight: '600' },
  pastille: {
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pastilleTexte: { ...TYPOGRAPHY.caption, color: COLORS.textInverse, fontWeight: '700' },
});
