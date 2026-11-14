// PBKDF2-HMAC-SHA-256 (RFC 8018) in plain TypeScript.
//
// Backups are encrypted under a key derived from the user's backup password, so they can be
// opened on any phone (AGENTS.md §1 rule 9). expo-crypto provides AES-GCM but no key
// derivation, so it is done here. This is the standard algorithm, not a variant: the tests
// compare it with Node's `crypto.pbkdf2Sync` and the RFC 7914 test vectors.
//
// Work happens on 32-bit words. After the first round every HMAC input is a single 32-byte
// block, so each further round costs exactly two SHA-256 compressions and allocates nothing.

const K = Int32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const INITIAL_STATE = Int32Array.from([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const BLOCK_BYTES = 64;
const DIGEST_BYTES = 32;

// Typed arrays here have fixed, known lengths, so an index read is never out of range; the
// `?? 0` only satisfies `noUncheckedIndexedAccess` without non-null assertions.

/** One SHA-256 compression of the block in `w[0..15]` into `state`. Uses `w[16..63]` as scratch. */
function compress(state: Int32Array, w: Int32Array): void {
  for (let i = 16; i < 64; i += 1) {
    const x = w[i - 15] ?? 0;
    const y = w[i - 2] ?? 0;
    const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
    const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
    w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) | 0;
  }

  let a = state[0] ?? 0;
  let b = state[1] ?? 0;
  let c = state[2] ?? 0;
  let d = state[3] ?? 0;
  let e = state[4] ?? 0;
  let f = state[5] ?? 0;
  let g = state[6] ?? 0;
  let h = state[7] ?? 0;

  for (let i = 0; i < 64; i += 1) {
    const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const choose = (e & f) ^ (~e & g);
    const t1 = (h + s1 + choose + (K[i] ?? 0) + (w[i] ?? 0)) | 0;
    const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const majority = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (s0 + majority) | 0;
    h = g;
    g = f;
    f = e;
    e = (d + t1) | 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) | 0;
  }

  state[0] = ((state[0] ?? 0) + a) | 0;
  state[1] = ((state[1] ?? 0) + b) | 0;
  state[2] = ((state[2] ?? 0) + c) | 0;
  state[3] = ((state[3] ?? 0) + d) | 0;
  state[4] = ((state[4] ?? 0) + e) | 0;
  state[5] = ((state[5] ?? 0) + f) | 0;
  state[6] = ((state[6] ?? 0) + g) | 0;
  state[7] = ((state[7] ?? 0) + h) | 0;
}

/**
 * Finishes a SHA-256 hash: absorbs `data` (padded) into a copy of `start`, a state that has
 * already absorbed `processedBytes` bytes in whole blocks.
 */
function finish(start: Int32Array, data: Uint8Array, processedBytes: number): Int32Array {
  const state = start.slice();
  const w = new Int32Array(64);
  const padded = new Uint8Array(Math.ceil((data.length + 9) / BLOCK_BYTES) * BLOCK_BYTES);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  const totalBits = (processedBytes + data.length) * 8;
  view.setUint32(padded.length - 8, Math.floor(totalBits / 0x1_0000_0000));
  view.setUint32(padded.length - 4, totalBits >>> 0);
  for (let offset = 0; offset < padded.length; offset += BLOCK_BYTES) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getInt32(offset + i * 4);
    compress(state, w);
  }
  return state;
}

function toBytes(words: Int32Array): Uint8Array {
  const bytes = new Uint8Array(words.length * 4);
  const view = new DataView(bytes.buffer);
  words.forEach((word, index) => view.setInt32(index * 4, word));
  return bytes;
}

/** SHA-256 of `data`. */
export function sha256(data: Uint8Array): Uint8Array {
  return toBytes(finish(INITIAL_STATE, data, 0));
}

/** States after absorbing the HMAC key XOR ipad / opad: the fixed first block of each hash. */
function hmacStates(key: Uint8Array): { inner: Int32Array; outer: Int32Array } {
  const blockKey = new Uint8Array(BLOCK_BYTES);
  blockKey.set(key.length > BLOCK_BYTES ? sha256(key) : key);
  const absorb = (pad: number): Int32Array => {
    const state = INITIAL_STATE.slice();
    const w = new Int32Array(64);
    const view = new DataView(blockKey.map((byte) => byte ^ pad).buffer);
    for (let i = 0; i < 16; i += 1) w[i] = view.getInt32(i * 4);
    compress(state, w);
    return state;
  };
  return { inner: absorb(0x36), outer: absorb(0x5c) };
}

/** HMAC-SHA-256 of `message` under `key`. */
export function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  const { inner, outer } = hmacStates(key);
  return toBytes(finish(outer, toBytes(finish(inner, message, BLOCK_BYTES)), BLOCK_BYTES));
}

/**
 * PBKDF2-HMAC-SHA-256 with a 32-byte output (one PBKDF2 block), the AES-256 key of a backup.
 * Synchronous and CPU-bound: about 2 × `iterations` SHA-256 compressions.
 */
export function pbkdf2Sha256(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
): Uint8Array {
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new RangeError('PBKDF2 needs a positive whole number of iterations.');
  }
  const { inner, outer } = hmacStates(password);

  // U1 = HMAC(password, salt || INT32_BE(1)).
  const firstMessage = new Uint8Array(salt.length + 4);
  firstMessage.set(salt);
  firstMessage[salt.length + 3] = 1;
  const u = finish(outer, toBytes(finish(inner, firstMessage, BLOCK_BYTES)), BLOCK_BYTES);
  const result = u.slice();

  // Every later HMAC input is the previous 32-byte U: one block holding U, the 0x80 padding
  // byte and the bit length of (key block + 32 bytes) = 768. Words 8..15 never change.
  const w = new Int32Array(64);
  w[8] = 0x80000000 | 0;
  w[15] = (BLOCK_BYTES + DIGEST_BYTES) * 8;
  const state = new Int32Array(8);

  for (let round = 1; round < iterations; round += 1) {
    w.set(u);
    state.set(inner);
    compress(state, w);
    w.set(state);
    state.set(outer);
    compress(state, w);
    u.set(state);
    for (let i = 0; i < 8; i += 1) result[i] = (result[i] ?? 0) ^ (state[i] ?? 0);
  }
  return toBytes(result);
}
