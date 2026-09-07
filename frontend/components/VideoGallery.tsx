import React, { useCallback } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { CONFIG } from '@/constants/config';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import type { ProfileVideo, VideoKind, VideoProvider } from '@/types';

const KIND_LABELS: Record<VideoKind, string> = {
  fight: 'Combat',
  sparring: 'Sparring',
  shadow: 'Shadow',
};

// Les logos servent à reconnaître la plateforme, pas à la mettre en avant : ils
// restent en gris. La charte réserve l'orange à ce sur quoi on peut appuyer, et
// une galerie où chaque tuile crie sa marque ne se lit plus.
const PROVIDER_ICONS: Record<VideoProvider, keyof typeof Ionicons.glyphMap> = {
  youtube: 'logo-youtube',
  tiktok: 'logo-tiktok',
  instagram: 'logo-instagram',
};

interface Props {
  videos: ProfileVideo[];
  /** Fourni sur son propre profil : affiche la case d'ajout et les retraits. */
  onAdd?: () => void;
  onRemove?: (video: ProfileVideo) => void;
  /** Message affiché quand la galerie est vide et qu'on ne peut pas la remplir. */
  emptyLabel?: string;
}

export function VideoGallery({ videos, onAdd, onRemove, emptyLabel }: Props) {
  const editable = onAdd !== undefined;
  // Proposer la case d'ajout sur une galerie pleine ferait remplir un formulaire
  // pour le voir refusé : on la retire, et le compteur explique pourquoi.
  const isFull = videos.length >= CONFIG.maxVideos;

  const open = useCallback((video: ProfileVideo) => {
    // La lecture se fait chez la plateforme : intégrer TikTok ou Instagram dans
    // une WebView casse sur Android, et une tuile qui n'ouvre rien est pire que
    // pas de tuile du tout.
    Linking.openURL(video.url).catch(() => undefined);
  }, []);

  if (videos.length === 0 && !editable) {
    if (!emptyLabel) return null;
    return <Text style={styles.empty}>{emptyLabel}</Text>;
  }

  return (
    <View style={styles.grid}>
      {videos.map((video) => (
        <Pressable
          key={video.id}
          style={styles.tile}
          onPress={() => open(video)}
          accessibilityRole="link"
          accessibilityLabel={
            video.caption ?? `Vidéo de ${KIND_LABELS[video.kind].toLowerCase()}`
          }
        >
          {video.thumbnailUrl ? (
            <Image source={{ uri: video.thumbnailUrl }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <View style={[styles.thumb, styles.thumbFallback]}>
              <Ionicons name={PROVIDER_ICONS[video.provider]} size={26} color={COLORS.textMuted} />
            </View>
          )}

          <View style={styles.playBadge}>
            <Ionicons name="play" size={12} color={COLORS.textInverse} />
          </View>

          <View style={styles.kindBadge}>
            <Text style={styles.kindText}>{KIND_LABELS[video.kind]}</Text>
          </View>

          {video.caption ? (
            <Text style={styles.caption} numberOfLines={1}>
              {video.caption}
            </Text>
          ) : null}

          {onRemove ? (
            <Pressable
              style={styles.remove}
              onPress={() => onRemove(video)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Retirer cette vidéo"
            >
              <Ionicons name="close" size={14} color={COLORS.textInverse} />
            </Pressable>
          ) : null}
        </Pressable>
      ))}

      {editable && !isFull ? (
        <Pressable
          style={[styles.tile, styles.addTile]}
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel="Ajouter une vidéo"
        >
          <Ionicons name="add" size={26} color={COLORS.primary} />
          <Text style={styles.addLabel}>Ajouter</Text>
        </Pressable>
      ) : null}

      {editable && isFull ? (
        <Text style={styles.full}>
          Galerie pleine ({CONFIG.maxVideos} vidéos). Retires-en une pour en ajouter une autre.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  addLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
    marginTop: SPACING.xs,
  },
  addTile: {
    alignItems: 'center',
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    borderWidth: 1,
    justifyContent: 'center',
  },
  caption: {
    ...TYPOGRAPHY.caption,
    backgroundColor: COLORS.overlay,
    bottom: 0,
    color: COLORS.text,
    left: 0,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    position: 'absolute',
    right: 0,
  },
  empty: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
  },
  full: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    width: '100%',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  kindBadge: {
    backgroundColor: COLORS.primarySoft,
    borderRadius: RADIUS.pill,
    left: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    position: 'absolute',
    top: SPACING.xs,
  },
  kindText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
    fontWeight: '700',
  },
  playBadge: {
    alignItems: 'center',
    backgroundColor: COLORS.overlay,
    borderRadius: RADIUS.pill,
    height: 26,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -13,
    marginTop: -13,
    position: 'absolute',
    top: '50%',
    width: 26,
  },
  remove: {
    alignItems: 'center',
    backgroundColor: COLORS.overlay,
    borderRadius: RADIUS.pill,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: SPACING.xs,
    top: SPACING.xs,
    width: 24,
  },
  thumb: {
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.md,
    height: '100%',
    width: '100%',
  },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tile: {
    aspectRatio: 3 / 4,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    flexBasis: '31%',
    overflow: 'hidden',
  },
});
