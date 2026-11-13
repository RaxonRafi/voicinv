import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// The mobile app is a standalone app: this config is self-contained and depends on nothing
// outside apps/mobile. Conventions enforced (AGENTS.md §15): no `any`, no non-null assertions.

const standalone = {
  group: ['**/apps/**', '**/packages/**', '@voiceledger/*'],
  message: 'The mobile app is standalone: do not import from other apps or shared packages.',
};

/** A feature's internals are private; other code imports its public API (index.ts). */
const featureInternals = {
  group: ['@/features/*/*'],
  message: "Import a feature through its public API: '@/features/<name>'.",
};

/** Feature and route code builds UI from the design system only (AGENTS.md §7.2). */
const designSystemOnly = {
  group: [
    'react-native',
    'react-native-svg',
    'lucide-react-native',
    'expo-image',
    '@shopify/flash-list',
  ],
  message: "Build UI from '@/core/ui'. If a component is missing, add it to core/ui first.",
};

const RAW_COLOR = {
  selector: 'Literal[value=/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]',
  message: 'No raw colors outside core/ui and design-tokens: use semantic theme tokens.',
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.expo/**',
      '**/.expo-export-check/**',
      '**/dist/**',
      '**/android/**',
      '**/ios/**',
      '**/coverage/**',
      '**/generated/**',
      'expo-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, __DEV__: 'readonly' },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-restricted-imports': ['error', { patterns: [standalone] }],
    },
  },
  {
    // Features: no other feature's internals, no raw React Native UI, no raw colors.
    files: ['src/features/**/*.{ts,tsx}'],
    ignores: ['src/features/**/__tests__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [standalone, designSystemOnly, featureInternals] },
      ],
      'no-restricted-syntax': ['error', RAW_COLOR],
    },
  },
  {
    // Routes are thin: they compose feature screens and navigation only.
    files: ['src/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [standalone, designSystemOnly, featureInternals] },
      ],
      'no-restricted-syntax': ['error', RAW_COLOR],
    },
  },
  {
    // Core, shared and the parser never depend on features.
    files: ['src/core/**/*.{ts,tsx}', 'src/shared/**/*.ts', 'src/parser/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            standalone,
            { group: ['@/features/*', '@/features'], message: 'core must not depend on features.' },
          ],
        },
      ],
    },
  },
  { files: ['**/*.{js,cjs,mjs}'], ...tseslint.configs.disableTypeChecked },
  {
    files: ['jest.setup.js', '**/__tests__/**'],
    languageOptions: { globals: { ...globals.jest } },
  },
  {
    files: ['**/*.cjs', '*.config.js', 'jest.setup.js'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  prettier,
);
