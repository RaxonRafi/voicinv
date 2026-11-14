// UUID version 7 (RFC 9562): a 48-bit Unix millisecond timestamp followed by random bits.
// IDs are generated on the device, sort by creation time and never need a server round trip.

export type RandomBytes = (length: number) => Uint8Array;

export interface UuidV7Options {
  /** Clock in epoch milliseconds. Defaults to `Date.now`. */
  now?: () => number;
  /** Cryptographically secure random source. Defaults to `crypto.getRandomValues`. */
  randomBytes?: RandomBytes;
}

interface CryptoLike {
  getRandomValues(array: Uint8Array): Uint8Array;
}

function defaultRandomBytes(length: number): Uint8Array {
  const { crypto } = globalThis as { crypto?: CryptoLike };
  if (!crypto) {
    throw new Error(
      'No secure random source: pass `randomBytes` to createUuidV7Generator (e.g. expo-crypto).',
    );
  }
  return crypto.getRandomValues(new Uint8Array(length));
}

const COUNTER_MAX = 0xfff;
const HEX = Array.from({ length: 256 }, (_unused, byte) => byte.toString(16).padStart(2, '0'));

function byteAt(bytes: Uint8Array, index: number): number {
  return bytes[index] ?? 0;
}

/**
 * Creates a UUIDv7 generator. IDs from one generator are strictly increasing, even when
 * several are created within the same millisecond or the clock steps backwards.
 */
export function createUuidV7Generator({
  now = Date.now,
  randomBytes = defaultRandomBytes,
}: UuidV7Options = {}): () => string {
  let lastTimestamp = -1;
  let counter = 0;

  return function uuidv7(): string {
    const random = randomBytes(10);
    let timestamp = Math.floor(now());

    if (timestamp > lastTimestamp) {
      // Start the 12-bit counter in its lower half, leaving room to count up within the ms.
      counter = ((byteAt(random, 0) << 8) | byteAt(random, 1)) & 0x7ff;
    } else {
      timestamp = lastTimestamp;
      counter += 1;
      if (counter > COUNTER_MAX) {
        timestamp += 1;
        counter = 0;
      }
    }
    lastTimestamp = timestamp;

    const bytes = new Uint8Array(16);
    // 48-bit big-endian timestamp. Division keeps the high bits exact beyond 32 bits.
    let remaining = timestamp;
    for (let index = 5; index >= 0; index -= 1) {
      bytes[index] = remaining % 256;
      remaining = Math.floor(remaining / 256);
    }
    bytes[6] = 0x70 | (counter >> 8); // version 7 + counter high bits
    bytes[7] = counter & 0xff;
    bytes[8] = 0x80 | (byteAt(random, 2) & 0x3f); // RFC variant + random
    for (let index = 9; index < 16; index += 1) bytes[index] = byteAt(random, index - 6);

    const hex = Array.from(bytes, (byte) => HEX[byte] ?? '00').join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
}

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isUuidV7(value: string): boolean {
  return UUID_V7.test(value);
}

/** Epoch milliseconds embedded in a UUIDv7. */
export function uuidV7Timestamp(id: string): number {
  if (!isUuidV7(id)) throw new RangeError(`Not a UUIDv7: "${id}"`);
  return Number.parseInt(id.slice(0, 8) + id.slice(9, 13), 16);
}
