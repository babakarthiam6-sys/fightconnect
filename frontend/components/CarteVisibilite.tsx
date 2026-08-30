import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useT } from '@/i18n';
import { libelleDuChamp, type Visibilite } from '@/utils/visibilite';

interface Props {
  visibilite: Visibilite;
}

/**
 * Dit à quelqu'un pourquoi personne ne le trouve.
 *
 * Le serveur refuse de mettre en ligne un profil sans discipline ni tarif, et
 * la recherche écarte les mêmes. Jusqu'ici l'application ne le disait qu'au
 * moment du refus : on cochait « Disponible », on recevait une erreur, et on
 * devinait le reste. La carte énonce la règle à l'avance, et nomme les champs
 * qui manquent — c'est la seule chose qui sépare un profil vide d'un profil
 * qu'on peut réserver.
 *
 * Trois états, trois messages différents. Un seul texte pour les trois aurait
 * été plus court à écrire et inutile à lire : « il vous manque deux
 * informations » et « vous êtes visible » n'appellent pas la même action.
 */
export function CarteVisibilite({ visibilite }: Props) {
  const t = useT();
  const { publiable, visible, obligatoiresManquants, recommandesManquants, progression } =
    visibilite;

  const ton = visible ? COLORS.success : publiable ? COLORS.secondary : COLORS.primary;
  const icone = visible ? 'checkmark-circle' : publiable ? 'toggle' : 'alert-circle';

  return (
    <View style={[styles.carte, { borderColor: ton }]}>
      <View style={styles.entete}>
        <Ionicons name={icone} size={20} color={ton} />
        <Text style={styles.titre}>
          {visible
            ? t('visibilite.titreVisible')
            : publiable
              ? t('visibilite.titrePret')
              : t('visibilite.titreIncomplet')}
        </Text>
      </View>

      {visible ? (
        <Text style={styles.texte}>{t('visibilite.visibleTexte')}</Text>
      ) : publiable ? (
        <Text style={styles.texte}>{t('visibilite.pretTexte')}</Text>
      ) : (
        <>
          <Text style={styles.texte}>
            {t(
              obligatoiresManquants.length > 1
                ? 'visibilite.manquePourPluriel'
                : 'visibilite.manquePour',
              { n: obligatoiresManquants.length },
            )}
          </Text>
          <View style={styles.liste}>
            {obligatoiresManquants.map((champ) => (
              <View key={champ} style={styles.ligne}>
                <Ionicons name="ellipse-outline" size={13} color={COLORS.primary} />
                <Text style={styles.champ}>{t(libelleDuChamp(champ))}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/*
        Les champs recommandés ne sont proposés qu'une fois l'obligatoire réglé.
        Les montrer plus tôt noierait les deux qui comptent vraiment dans une
        liste de six.
      */}
      {publiable && recommandesManquants.length > 0 ? (
        <Text style={styles.conseil}>
          {t('visibilite.mieuxTrouve', {
            champs: recommandesManquants.map((champ) => t(libelleDuChamp(champ))).join(', '),
          })}
        </Text>
      ) : null}

      <View style={styles.piste} accessibilityRole="progressbar">
        <View
          style={[styles.jauge, { backgroundColor: ton, width: `${Math.round(progression * 100)}%` }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  carte: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    padding: SPACING.lg,
  },
  entete: { alignItems: 'center', flexDirection: 'row', gap: SPACING.sm },
  titre: { ...TYPOGRAPHY.subtitle, color: COLORS.text, flex: 1 },
  texte: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, lineHeight: 18 },
  liste: { gap: SPACING.xs, marginTop: SPACING.xs },
  ligne: { alignItems: 'center', flexDirection: 'row', gap: SPACING.sm },
  champ: { ...TYPOGRAPHY.body, color: COLORS.text },
  conseil: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, lineHeight: 18 },
  piste: {
    backgroundColor: COLORS.border,
    borderRadius: RADIUS.pill,
    height: 4,
    marginTop: SPACING.sm,
    overflow: 'hidden',
  },
  jauge: { borderRadius: RADIUS.pill, height: 4 },
});

export default CarteVisibilite;
