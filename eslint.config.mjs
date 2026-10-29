import js from '@eslint/js';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import a11y from 'eslint-plugin-jsx-a11y';
import hooks from 'eslint-plugin-react-hooks';
export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.wrangler/**',
      '.build/**',
      'worker-configuration.d.ts',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,jsx,ts}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
        DurableObjectState: 'readonly',
        Env: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_|^React$' }],
      'no-undef': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  { files: ['**/*.ts'], rules: { 'no-unused-vars': 'off' } },
  {
    files: ['web/src/**/*.jsx'],
    plugins: { 'jsx-a11y': a11y, 'react-hooks': hooks },
    rules: {
      ...a11y.configs.recommended.rules,
      ...hooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
    },
  },
];
