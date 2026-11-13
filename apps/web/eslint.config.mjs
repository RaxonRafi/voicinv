import js from '@eslint/js';
import next from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// The landing site is a standalone app: this config is self-contained and depends on nothing
// outside apps/web. Conventions enforced (AGENTS.md §15): no `any`, no non-null assertions.
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/out/**',
      '**/coverage/**',
      '**/generated/**',
      '**/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
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
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { '@next/next': next, 'react-hooks': reactHooks },
    rules: {
      ...next.configs['core-web-vitals'].rules,
      ...reactHooks.configs.recommended.rules,
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // Module boundaries (AGENTS.md §6.1): other code imports a module's public API
              // (index.ts), never its internal files. Files inside a module use relative imports.
              group: ['@/components/*', '@/content/*'],
              message: "Import from the module's public API ('@/components' or '@/content').",
            },
            {
              // The landing site, the backend and the mobile app are separate deployables.
              group: ['**/apps/**', '**/packages/**', '@voiceledger/*'],
              message:
                'The landing site is standalone: do not import from other apps or shared packages.',
            },
          ],
        },
      ],
    },
  },
  { files: ['**/*.{js,cjs,mjs}'], ...tseslint.configs.disableTypeChecked },
  prettier,
);
