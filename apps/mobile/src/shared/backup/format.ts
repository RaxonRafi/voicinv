// Container format of an encrypted backup file (AGENTS.md §1 rule 9).
//
// The backup is encrypted on the device with AES-256-GCM under a key derived from the user's
// backup password. The server stores the file as it is and can never read it: it only checks
// that an upload really is this container, so plaintext is never accepted by accident.
//
//   offset  size  field
//   0       4     magic "VLBK"
//   4       1     format version (1)
//   5       1     key derivation: 1 = PBKDF2-HMAC-SHA-256
//   6       4     key derivation iterations, big-endian
//   10      16    salt
//   26      12     AES-GCM nonce
//   38      …     ciphertext followed by the 16-byte GCM tag
//
// The 38 header bytes are authenticated as additional data, so they cannot be altered.

export const BACKUP_MAGIC = 'VLBK';
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_KDF_PBKDF2_SHA256 = 1;
export const BACKUP_SALT_LENGTH = 16;
export const BACKUP_NONCE_LENGTH = 12;
export const BACKUP_TAG_LENGTH = 16;
export const BACKUP_HEADER_LENGTH = 38;

/** Fewest iterations a backup may claim; lower values would make password guessing cheap. */
export const BACKUP_MIN_KDF_ITERATIONS = 100_000;
/** Iterations used for new backups. */
export const BACKUP_KDF_ITERATIONS = 210_000;
/** Most iterations accepted when reading, so a crafted file cannot stall the app. */
export const BACKUP_MAX_KDF_ITERATIONS = 5_000_000;

export interface BackupHeader {
  formatVersion: number;
  iterations: number;
  salt: Uint8Array;
  nonce: Uint8Array;
}

/** Builds the 38-byte header. Throws when a field has the wrong size or range. */
export function encodeBackupHeader(header: Omit<BackupHeader, 'formatVersion'>): Uint8Array {
  const { iterations, salt, nonce } = header;
  if (salt.length !== BACKUP_SALT_LENGTH) throw new RangeError('Backup salt must be 16 bytes.');
  if (nonce.length !== BACKUP_NONCE_LENGTH) throw new RangeError('Backup nonce must be 12 bytes.');
  if (
    !Number.isInteger(iterations) ||
    iterations < BACKUP_MIN_KDF_ITERATIONS ||
    iterations > BACKUP_MAX_KDF_ITERATIONS
  ) {
    throw new RangeError('Backup key derivation iterations are out of range.');
  }

  const bytes = new Uint8Array(BACKUP_HEADER_LENGTH);
  for (let index = 0; index < BACKUP_MAGIC.length; index += 1) {
    bytes[index] = BACKUP_MAGIC.charCodeAt(index);
  }
  bytes[4] = BACKUP_FORMAT_VERSION;
  bytes[5] = BACKUP_KDF_PBKDF2_SHA256;
  bytes[6] = Math.floor(iterations / 0x1000000) & 0xff;
  bytes[7] = (iterations >> 16) & 0xff;
  bytes[8] = (iterations >> 8) & 0xff;
  bytes[9] = iterations & 0xff;
  bytes.set(salt, 10);
  bytes.set(nonce, 26);
  return bytes;
}

/**
 * Reads the header of an encrypted backup. Returns null when the bytes are not a backup this
 * version understands: wrong magic, unknown version or key derivation, implausible iteration
 * count, or too short to hold a header and an authentication tag.
 */
export function decodeBackupHeader(bytes: Uint8Array): BackupHeader | null {
  if (bytes.length < BACKUP_HEADER_LENGTH + BACKUP_TAG_LENGTH) return null;
  for (let index = 0; index < BACKUP_MAGIC.length; index += 1) {
    if (bytes[index] !== BACKUP_MAGIC.charCodeAt(index)) return null;
  }
  if (bytes[4] !== BACKUP_FORMAT_VERSION || bytes[5] !== BACKUP_KDF_PBKDF2_SHA256) return null;

  const iterations =
    (bytes[6] ?? 0) * 0x1000000 +
    ((bytes[7] ?? 0) << 16) +
    ((bytes[8] ?? 0) << 8) +
    (bytes[9] ?? 0);
  if (iterations < BACKUP_MIN_KDF_ITERATIONS || iterations > BACKUP_MAX_KDF_ITERATIONS) return null;

  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    iterations,
    salt: bytes.slice(10, 26),
    nonce: bytes.slice(26, BACKUP_HEADER_LENGTH),
  };
}

/** True when the bytes are an encrypted backup container (not plaintext, not another file). */
export function isEncryptedBackup(bytes: Uint8Array): boolean {
  return decodeBackupHeader(bytes) !== null;
}
