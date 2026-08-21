import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useToast } from 'react-native-toast-notifications';

import EmptyState from '@/components/EmptyState';
import ErrorView from '@/components/ErrorView';
import LoadingSpinner from '@/components/LoadingSpinner';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useChatSocket } from '@/hooks/useChatSocket';
import { chatService } from '@/services/chat';
import { partnerService } from '@/services/partner';
import { formatTime, formatUserName } from '@/utils/formatting';
import type { AppError, Message } from '@/types';

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const toast = useToast();
  const { user } = useAuth();

  const listRef = useRef<FlatList<Message>>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);

  const receive = useCallback((message: Message) => {
    // Le serveur renvoie aussi à l'expéditeur ce qu'il vient d'envoyer : on
    // écarte les doublons plutôt que d'afficher deux fois la même bulle.
    setMessages((previous) =>
      previous.some((item) => item.id === message.id) ? previous : [...previous, message],
    );
  }, []);

  const blocked = useCallback(
    (text: string) => toast.show(text, { type: 'warning', duration: 6000 }),
    [toast],
  );

  const { isConnected, send } = useChatSocket({ onMessage: receive, onBlocked: blocked });

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const [history, partner] = await Promise.all([
        chatService.history(id),
        partnerService.detail(id).catch(() => null),
      ]);
      setMessages(history);
      if (partner) navigation.setOptions({ title: formatUserName(partner) });
    } catch (caught) {
      setError(caught as AppError);
    } finally {
      setIsLoading(false);
    }
  }, [id, navigation]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (messages.length > 0) listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  const submit = useCallback(() => {
    const content = draft.trim();
    if (!content || !id) return;

    if (!send(id, content)) {
      toast.show('Message non envoyé : connexion interrompue.', { type: 'danger' });
      return;
    }
    setDraft('');
  }, [draft, id, send, toast]);

  const mine = useMemo(() => user?.id ?? '', [user]);

  if (isLoading) return <LoadingSpinner fullScreen label="Chargement de la conversation…" />;
  if (error) return <ErrorView error={error} onRetry={load} />;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {!isConnected ? (
          <View style={styles.bandeau}>
            <Ionicons name="cloud-offline-outline" size={14} color={COLORS.warning} />
            <Text style={styles.bandeauTexte}>Reconnexion…</Text>
          </View>
        ) : null}

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isMine = item.senderId === mine;
            return (
              <View style={[styles.bulle, isMine ? styles.bulleMienne : styles.bulleAutre]}>
                <Text style={isMine ? styles.texteMien : styles.texteAutre}>{item.content}</Text>
                <Text style={isMine ? styles.heureMienne : styles.heureAutre}>
                  {formatTime(item.createdAt)}
                </Text>
              </View>
            );
          }}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="chatbubble-outline"
              title="Rien encore"
              message="Dites bonjour, et calez l’heure et le lieu."
            />
          }
        />

        <View style={styles.composeur}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Votre message…"
            placeholderTextColor={COLORS.textMuted}
            style={styles.champ}
            multiline
            maxLength={1000}
            onSubmitEditing={submit}
            testID="chat-input"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Envoyer"
            onPress={submit}
            disabled={draft.trim().length === 0}
            style={({ pressed }) => [
              styles.envoyer,
              draft.trim().length === 0 && styles.envoyerInactif,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="send" size={19} color={COLORS.textInverse} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: COLORS.background, flex: 1 },
  flex: { flex: 1 },
  bandeau: {
    alignItems: 'center',
    backgroundColor: COLORS.warningSoft,
    flexDirection: 'row',
    gap: SPACING.xs,
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
  },
  bandeauTexte: { ...TYPOGRAPHY.caption, color: COLORS.warning },
  list: { flexGrow: 1, gap: SPACING.sm, padding: SPACING.lg },
  bulle: {
    borderRadius: RADIUS.lg,
    maxWidth: '82%',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  bulleMienne: { alignSelf: 'flex-end', backgroundColor: COLORS.primary },
  bulleAutre: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  texteMien: { ...TYPOGRAPHY.body, color: COLORS.textInverse, fontSize: 15 },
  texteAutre: { ...TYPOGRAPHY.body, color: COLORS.text, fontSize: 15 },
  heureMienne: {
    ...TYPOGRAPHY.caption,
    alignSelf: 'flex-end',
    color: COLORS.textInverse,
    fontSize: 10,
    opacity: 0.8,
  },
  heureAutre: { ...TYPOGRAPHY.caption, alignSelf: 'flex-end', color: COLORS.textMuted, fontSize: 10 },
  composeur: {
    alignItems: 'flex-end',
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    padding: SPACING.md,
  },
  champ: {
    ...TYPOGRAPHY.body,
    backgroundColor: COLORS.surfaceRaised,
    borderColor: COLORS.border,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    color: COLORS.text,
    flex: 1,
    fontSize: 15,
    maxHeight: 120,
    minHeight: 46,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  envoyer: {
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  envoyerInactif: { backgroundColor: COLORS.disabled },
  pressed: { opacity: 0.85 },
});
