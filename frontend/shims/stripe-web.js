/**
 * Substitut de `@stripe/stripe-react-native` pour la cible web.
 *
 * Le vrai paquet importe des modules internes de React Native qui n'existent pas
 * sur le web : sa seule présence empêche l'application de se construire. La
 * Payment Sheet est de toute façon native, donc indisponible dans un navigateur.
 *
 * Le substitut ne fait pas semblant de fonctionner : il renvoie une erreur
 * explicite, que `PaymentForm` affiche telle quelle à l'utilisateur.
 */

const INDISPONIBLE = {
  code: 'Failed',
  message:
    'Le paiement par carte n’est pas disponible dans la version web. ' +
    'Ouvrez l’application installée sur votre téléphone pour régler une séance.',
};

export function StripeProvider({ children }) {
  return children;
}

export function useStripe() {
  return {
    initPaymentSheet: async () => ({ error: INDISPONIBLE }),
    presentPaymentSheet: async () => ({ error: INDISPONIBLE }),
    confirmPayment: async () => ({ error: INDISPONIBLE }),
  };
}

export default { StripeProvider, useStripe };
