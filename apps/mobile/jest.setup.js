// Test setup. Native modules that cannot run in Node are replaced with small in-memory fakes;
// everything else (database, use cases, parser, formatting) runs for real.

jest.setTimeout(20000);

jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    getItemAsync: jest.fn(async (key) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key, value) => void store.set(key, value)),
    deleteItemAsync: jest.fn(async (key) => void store.delete(key)),
  };
});

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en', languageTag: 'en-US', regionCode: 'US' }],
}));

// The phone's address book does not exist in Node. Screens that import contacts take their
// contact source as a prop, so tests pass their own; this fake only lets the module load.
jest.mock('expo-contacts', () => ({
  Contact: { getAllDetails: jest.fn(async () => []) },
  ContactField: { FULL_NAME: 'fullName', PHONES: 'phones' },
  requestPermissionsAsync: jest.fn(async () => ({ granted: false })),
}));

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

require('@shopify/flash-list/jestSetup');

// Device services (share sheet, PDF rendering, printing) cannot run in Node. Screens are
// tested up to the call into them; the documents they receive are checked as plain HTML.
jest.mock('@/core/platform', () => ({
  shareText: jest.fn(async () => undefined),
  shareFile: jest.fn(async () => undefined),
  htmlToPdf: jest.fn(async (_html, fileName) => `file:///cache/${fileName}.pdf`),
  printHtml: jest.fn(async () => undefined),
  writeCacheFile: jest.fn(async (fileName) => `file:///cache/${fileName}`),
  getCurrentAppState: jest.fn(() => 'active'),
  onAppStateChange: jest.fn(() => () => undefined),
}));

// Navigation is replaced by spies: screens are tested for what they do, not for routing itself.
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
  Redirect: () => null,
  useLocalSearchParams: jest.fn(() => ({})),
}));

jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(async () => undefined),
  isSpeakingAsync: jest.fn(async () => false),
}));

jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    supportsOnDeviceRecognition: jest.fn(() => true),
    requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
    getPermissionsAsync: jest.fn(async () => ({ granted: true })),
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));

jest.mock('expo-crypto', () => {
  const crypto = require('crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: jest.fn(async (_algo, str) =>
      crypto.createHash('sha256').update(str).digest('hex'),
    ),
    randomUUID: jest.fn(() => crypto.randomUUID()),
  };
});

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true })),
}));
