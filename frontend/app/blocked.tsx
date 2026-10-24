import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useToast } from 'react-native-toast-notifications';

import Avatar from '@/components/Avatar';
import Button from '@/components/Button';
import EmptyState from '@/components/EmptyState';
import ErrorView from '@/components/ErrorView';
import LoadingSpinner from '@/components/LoadingSpinner';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { safetyService } from '@/services/safety';
import { formatUserName } from '@/utils/formatting';
import type { AppError, UserSummary } from '@/types';

/** Les personnes que l'on a bloquées, et le moyen de revenir sur sa décision. */
export default function BlockedScreen() {
  const toast = useToast();
  const [people, setPeople] = useState<UserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setPeople(await safetyService.blocked());
    } catch (caught) {
      setError(caught as AppError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unblock = async (person: UserSummary) => {
    setBusyId(person.id);
    try {
      await safetyService.unblock(person.id);
      setPeople((previous) => previous.filter((item) => item.id !== person.id));
      toast.show(`Vous avez débloqué ${person.firstName || 'cette personne'}.`, {
        type: 'success',
      });
    } catch (caught) {
      toast.show((caught as AppError).message, { type: 'danger' });
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading) return <LoadingSpinner fullScreen label="Chargement…" />;
  if (error) return <ErrorView error={error} onRetry={load} />;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={people}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          people.length > 0 ? (
            <Text style={styles.intro}>
              Une personne bloquée ne peut plus vous écrire, vous réserver ni répondre à vos
              annonces. Elle n’en est pas avertie.
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Avatar user={item} size={44} />
            <View style={styles.text}>
              <Text style={styles.name}>{formatUserName(item)}</Text>
              {item.city ? <Text style={styles.city}>{item.city}</Text> : null}
            </View>
            <Button
              label="Débloquer"
              variant="outline"
              fullWidth={false}
              onPress={() => void unblock(item)}
              loading={busyId === item.id}
              disabled={busyId !== null}
            />
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="shield-checkmark-outline"
            title="Personne de bloqué"
            message="Depuis une fiche, une conversation ou une annonce, le menu ⋯ permet de bloquer quelqu’un."
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: COLORS.background, flex: 1 },
  list: { flexGrow: 1, gap: SPACING.sm, padding: SPACING.lg },
  intro: { ...TYPOGRAPHY.body, color: COLORS.textMuted, lineHeight: 20, marginBottom: SPACING.sm },
  row: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    flexDirection: 'row',
    gap: SPACING.md,
    padding: SPACING.md,
  },
  text: { flex: 1, gap: 2 },
  name: { ...TYPOGRAPHY.subtitle, color: COLORS.text },
  city: { ...TYPOGRAPHY.caption, color: COLORS.textMuted },
});
