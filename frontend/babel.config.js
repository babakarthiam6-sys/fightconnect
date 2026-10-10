module.exports = function (api) {
  api.cache(true);
  // Depuis le SDK 54, babel-preset-expo ajoute lui-même le plugin des worklets
  // (Reanimated 4) : le déclarer ici en plus le ferait passer deux fois.
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          jsxImportSource: 'react',
          // Le bundle web est chargé comme un script classique, pas comme un
          // module : un seul `import.meta` y est une erreur de syntaxe qui empêche
          // l'application entière de démarrer (écran noir). Metro résout
          // désormais certaines dépendances vers leur version ESM, qui en
          // contient — zustand le premier. Expo fournit de quoi le remplacer.
          web: { unstable_transformImportMeta: true },
        },
      ],
    ],
  };
};
