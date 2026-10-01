// Configuration « flat » d'ESLint 9, imposée par eslint-config-expo 10 (SDK 54).
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier');

module.exports = defineConfig([
  // `eslint-config-expo` couvre React, React Native, les hooks et l'accessibilité.
  expoConfig,
  prettier,
  {
    ignores: ['node_modules/', '.expo/', 'dist/', 'coverage/'],
  },
  {
    rules: {
      // Les dépendances de hooks sont vérifiées strictement : une dépendance
      // oubliée est la principale source de données périmées dans cette app.
      'react-hooks/exhaustive-deps': 'error',
      // Les composants exportent volontairement leur fonction sous les deux
      // formes (nommée et par défaut). Ces règles, ajoutées par la config flat
      // d'Expo, signaleraient chaque import par défaut sans rien y gagner.
      'import/no-named-as-default': 'off',
      'import/no-named-as-default-member': 'off',
    },
  },
  {
    files: ['__tests__/**/*', 'jest.setup.js'],
    rules: {
      // Les fabriques de `jest.mock` sont remontées au-dessus des imports : elles
      // ne peuvent charger leurs modules qu'avec `require`.
      '@typescript-eslint/no-require-imports': 'off',
    },
    languageOptions: {
      globals: {
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
  },
]);
