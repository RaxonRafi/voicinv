import {
  AESEncryptionKey,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
  getRandomBytes,
} from 'expo-crypto';

import {
  BACKUP_HEADER_LENGTH,
  BACKUP_KDF_ITERATIONS,
  BACKUP_NONCE_LENGTH,
  BACKUP_SALT_LENGTH,
  BACKUP_TAG_LENGTH,
  decodeBackupHeader,
  encodeBackupHeader,
} from '@/shared';

import { pbkdf2Sha256 } from './pbkdf2';
import { BackupError } from './types';

// Encrypted backup files (AGENTS.md §1 rule 9), in the container format of
// `src/shared/backup/format`: a 38-byte header, then AES-256-GCM ciphertext and tag. The key
// is derived from the user's backup password with PBKDF2; the header is authenticated as
// additional data. The same file can be kept on the phone, shared, or uploaded to the cloud:
// nobody without the password can read it, the server included.

/** Shortest backup password accepted. */
export const BACKUP_PASSWORD_MIN_LENGTH = 8;

const encoder = new TextEncoder();

function deriveKey(password: string, salt: Uint8Array, iterations: number): Uint8Array {
  return pbkdf2Sha256(encoder.encode(password.normalize('NFKC')), salt, iterations);
}

export interface EncryptOptions {
  /** Defaults to the current recommendation. Lower values exist for fast tests only. */
  iterations?: number;
}

/** Encrypts `plaintext` into a backup container that only `password` can open. */
export async function encryptBackup(
  plaintext: Uint8Array,
  password: string,
  options: EncryptOptions = {},
): Promise<Uint8Array> {
  if (password.length < BACKUP_PASSWORD_MIN_LENGTH) throw new BackupError('PASSWORD_TOO_SHORT');
  const iterations = options.iterations ?? BACKUP_KDF_ITERATIONS;
  const salt = getRandomBytes(BACKUP_SALT_LENGTH);
  const nonce = getRandomBytes(BACKUP_NONCE_LENGTH);
  const header = encodeBackupHeader({ iterations, salt, nonce });

  const key = await AESEncryptionKey.import(deriveKey(password, salt, iterations));
  const sealed = await aesEncryptAsync(plaintext, key, {
    nonce: { bytes: nonce },
    tagLength: BACKUP_TAG_LENGTH,
    additionalData: header,
  });
  const body = await sealed.ciphertext({ includeTag: true, encoding: 'bytes' });

  const file = new Uint8Array(header.length + body.length);
  file.set(header);
  file.set(body, header.length);
  return file;
}

/**
 * Opens a backup container. Throws `BackupError('NOT_A_BACKUP')` when the bytes are not one,
 * and `BackupError('WRONG_PASSWORD')` when the password is wrong or the file was altered
 * (AES-GCM cannot tell those two apart, by design).
 */
export async function decryptBackup(file: Uint8Array, password: string): Promise<Uint8Array> {
  const header = decodeBackupHeader(file);
  if (!header) throw new BackupError('NOT_A_BACKUP');

  const key = await AESEncryptionKey.import(deriveKey(password, header.salt, header.iterations));
  const sealed = AESSealedData.fromParts(
    header.nonce,
    file.subarray(BACKUP_HEADER_LENGTH),
    BACKUP_TAG_LENGTH,
  );
  try {
    return await aesDecryptAsync(sealed, key, {
      output: 'bytes',
      additionalData: file.subarray(0, BACKUP_HEADER_LENGTH),
    });
  } catch {
    throw new BackupError('WRONG_PASSWORD');
  }
}

/** UTF-8 encoding of a string (TextEncoder is available in Hermes). */
export function encodeUtf8(text: string): Uint8Array {
  return encoder.encode(text);
}

/**
 * Strict UTF-8 decoding. Written out because Hermes does not provide TextDecoder on every
 * supported version. Malformed input throws instead of being replaced silently.
 */
export function decodeUtf8(bytes: Uint8Array): string {
  const codePoints: number[] = [];
  let index = 0;
  const continuation = (): number => {
    const byte = bytes[index] ?? -1;
    if ((byte & 0xc0) !== 0x80) throw new BackupError('NOT_A_BACKUP');
    index += 1;
    return byte & 0x3f;
  };
  while (index < bytes.length) {
    const lead = bytes[index] ?? 0;
    index += 1;
    let point: number;
    if (lead < 0x80) {
      point = lead;
    } else if (lead >= 0xc2 && lead < 0xe0) {
      point = ((lead & 0x1f) << 6) | continuation();
    } else if (lead >= 0xe0 && lead < 0xf0) {
      point = ((lead & 0x0f) << 12) | (continuation() << 6) | continuation();
      if (point < 0x800 || (point >= 0xd800 && point <= 0xdfff)) {
        throw new BackupError('NOT_A_BACKUP');
      }
    } else if (lead >= 0xf0 && lead < 0xf5) {
      point =
        ((lead & 0x07) << 18) | (continuation() << 12) | (continuation() << 6) | continuation();
      if (point < 0x10000 || point > 0x10ffff) throw new BackupError('NOT_A_BACKUP');
    } else {
      throw new BackupError('NOT_A_BACKUP');
    }
    codePoints.push(point);
  }
  let text = '';
  for (let start = 0; start < codePoints.length; start += 8192) {
    text += String.fromCodePoint(...codePoints.slice(start, start + 8192));
  }
  return text;
}
