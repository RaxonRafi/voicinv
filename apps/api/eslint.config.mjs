import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// The API is a standalone app: this config is self-contained and depends on nothing outside
// apps/api. Conventions enforced (AGENTS.md §15): no `any`, no non-null assertions.
export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // The backend, the landing site and the mobile app are separate deployables. Nothing here
      // may reach into another app or into a shared workspace package.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/apps/**', '**/packages/**', '@voiceledger/*'],
              message: 'The API is standalone: do not import from other apps or shared packages.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      // NestJS resolves constructor dependencies from emitted decorator metadata, which needs
      // real (value) imports of injected classes, so `import type` is not enforced here.
      '@typescript-eslint/consistent-type-imports': 'off',
      // Nest modules are intentionally empty decorated classes.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  },
  { files: ['**/*.{js,cjs,mjs}'], ...tseslint.configs.disableTypeChecked },
  prettier,
);
