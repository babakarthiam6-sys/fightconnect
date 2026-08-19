// Configuration Metro explicite, requise pour la cible web.
const path = require('path');

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const STRIPE_WEB_SHIM = path.resolve(__dirname, 'shims/stripe-web.js');

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Le SDK Stripe natif importe des modules internes de React Native absents du
  // web ; sans cette substitution, l'application entière refuse de se construire.
  if (platform === 'web' && moduleName === '@stripe/stripe-react-native') {
    return { type: 'sourceFile', filePath: STRIPE_WEB_SHIM };
  }

  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
