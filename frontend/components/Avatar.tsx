import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { COLORS, TYPOGRAPHY } from '@/constants/theme';
import { getInitials } from '@/utils/formatting';

interface Props {
  user: { firstName?: string | null; lastName?: string | null; avatarUrl?: string | null } | null;
  size?: number;
}

/** Photo de profil, avec repli sur les initiales quand l'URL est absente. */
export function Avatar({ user, size = 44 }: Props) {
  const dimension = { width: size, height: size, borderRadius: size / 2 };

  if (user?.avatarUrl) {
    return <Image source={{ uri: user.avatarUrl }} style={[styles.image, dimension]} />;
  }

  return (
    <View style={[styles.fallback, dimension]}>
      <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{getInitials(user)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: COLORS.border },
  fallback: {
    alignItems: 'center',
    backgroundColor: COLORS.secondary,
    justifyContent: 'center',
  },
  initials: { ...TYPOGRAPHY.subtitle, color: COLORS.textInverse },
});

export default Avatar;
