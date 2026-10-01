/**
 * Configuration dynamique : reprend `app.json` tel quel et vérifie la clé Stripe.
 *
 * `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` est inlinée dans le bundle, donc lisible
 * par quiconque ouvre l'APK. Seule une clé publique (`pk_`) peut y figurer. Une
 * clé secrète (`sk_`) ou restreinte (`rk_`) collée par erreur dans la variable
 * EAS serait publiée sur le Play Store : le build s'arrête plutôt.
 *
 * La valeur ne vit ni ici ni dans `eas.json` : elle est lue depuis les variables
 * d'environnement EAS du profil de build (voir le champ `environment` d'eas.json).
 */
module.exports = ({ config }) => {
  const key = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

  if (key && !key.startsWith('pk_')) {
    throw new Error(
      'EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY doit être une clé publique Stripe (pk_…). ' +
        'Une clé secrète ne doit jamais être embarquée dans l’application.',
    );
  }

  if (!key && process.env.EAS_BUILD_PROFILE === 'production') {
    console.warn(
      'EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY est absente : le paiement sera désactivé ' +
        'dans ce build. Créez-la avec « eas env:set --environment production ».',
    );
  }

  return config;
};
