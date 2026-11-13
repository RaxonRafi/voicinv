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
  writeCacheBytes: jest.fn(async (fileName) => `file:///cache/${fileName}`),
  readFileBytes: jest.fn(async () => new Uint8Array()),
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

// expo-crypto's AES-GCM is native code; Node's implementation of the same cipher stands in
// for it, with the same call shapes, so encrypted backups are produced and checked for real.
jest.mock('expo-crypto', () => {
  const crypto = require('crypto');
  const TAG = 16;

  const AESEncryptionKey = {
    import: async (bytes) => {
      if (bytes.length !== 32) throw new Error('fake AES: only 256-bit keys are used');
      return { key: Buffer.from(bytes) };
    },
  };

  class AESSealedData {
    constructor(iv, ciphertextWithTag) {
      this.ivBytes = Buffer.from(iv);
      this.data = Buffer.from(ciphertextWithTag);
    }
    static fromParts(iv, ciphertextWithTag) {
      return new AESSealedData(iv, ciphertextWithTag);
    }
    async ciphertext() {
      return new Uint8Array(this.data);
    }
  }

  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: jest.fn(async (_algo, str) =>
      crypto.createHash('sha256').update(str).digest('hex'),
    ),
    randomUUID: jest.fn(() => crypto.randomUUID()),
    getRandomBytes: jest.fn((count) => new Uint8Array(crypto.randomBytes(count))),
    AESEncryptionKey,
    AESSealedData,
    aesEncryptAsync: jest.fn(async (plaintext, key, options) => {
      const nonce = Buffer.from(options.nonce.bytes);
      const cipher = crypto.createCipheriv('aes-256-gcm', key.key, nonce, { authTagLength: TAG });
      cipher.setAAD(Buffer.from(options.additionalData));
      const body = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
      return new AESSealedData(nonce, Buffer.concat([body, cipher.getAuthTag()]));
    }),
    aesDecryptAsync: jest.fn(async (sealed, key, options) => {
      const body = sealed.data.subarray(0, sealed.data.length - TAG);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key.key, sealed.ivBytes, {
        authTagLength: TAG,
      });
      decipher.setAAD(Buffer.from(options.additionalData));
      decipher.setAuthTag(sealed.data.subarray(sealed.data.length - TAG));
      return new Uint8Array(Buffer.concat([decipher.update(body), decipher.final()]));
    }),
  };
});

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true })),
}));
