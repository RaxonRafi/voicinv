/**
 * Jest runs every test in Node through the jest-expo preset: pure logic (use cases, parser,
 * database on node:sqlite) and component tests with React Native Testing Library.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/src', '<rootDir>/design-tokens', '<rootDir>/plugins'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tokens/(.*)$': '<rootDir>/design-tokens/$1',
    // Lucide's React Native entry is an ES module; Jest loads its CommonJS build instead.
    '^lucide-react-native$':
      '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
  },
  // jest-expo's default list plus FlashList, which also ships untranspiled ES modules.
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@shopify/flash-list|standard-navigation))',
    '/node_modules/@react-native/babel-preset/',
  ],
  setupFiles: ['<rootDir>/jest.setup.js'],
  clearMocks: true,
};
