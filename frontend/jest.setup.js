/* eslint-env jest */

// Modules natifs remplacés par les mocks officiels : les tests tournent sous Node,
// sans pont natif.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock'),
);

// La Payment Sheet ouvre une vue native : on n'en teste que le contrat.
jest.mock('@stripe/stripe-react-native', () => ({
  StripeProvider: ({ children }) => children,
  useStripe: () => ({
    initPaymentSheet: jest.fn().mockResolvedValue({}),
    presentPaymentSheet: jest.fn().mockResolvedValue({}),
  }),
}));

jest.mock('react-native-toast-notifications', () => ({
  ToastProvider: ({ children }) => children,
  useToast: () => ({ show: jest.fn(), hide: jest.fn() }),
}));

// @expo/vector-icons v14 appelle `ExpoFontLoader.getLoadedFonts`, absent du
// runtime de test : on rend une icône comme simple texte.
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name }) => React.createElement(Text, null, name);
  return { Ionicons: Icon, MaterialIcons: Icon, FontAwesome: Icon };
});
