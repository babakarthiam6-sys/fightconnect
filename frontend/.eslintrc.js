module.exports = {
  root: true,
  // `eslint-config-expo` couvre React, React Native, les hooks et l'accessibilité.
  extends: ['expo', 'prettier'],
  ignorePatterns: ['node_modules/', '.expo/', 'dist/', 'coverage/'],
  rules: {
    // Les dépendances de hooks sont vérifiées strictement : une dépendance
    // oubliée est la principale source de données périmées dans cette app.
    'react-hooks/exhaustive-deps': 'error',
  },
  overrides: [
    {
      files: ['__tests__/**/*'],
      env: { jest: true },
    },
  ],
};
