module.exports = function (api) {
  api.cache(true);
  // Depuis le SDK 54, babel-preset-expo ajoute lui-même le plugin des worklets
  // (Reanimated 4) : le déclarer ici en plus le ferait passer deux fois.
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
  };
};
