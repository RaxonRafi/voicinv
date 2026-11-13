import { argon2, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// Argon2id through Node's built-in crypto (Node 24.7+), so no native add-on is needed.
// Parameters follow the OWASP password storage recommendation: 19 MiB, 2 passes, 1 lane.
const argon2Async = promisify(argon2);

const MEMORY_KIB = 19_456;
const PASSES = 2;
const PARALLELISM = 1;
const SALT_BYTES = 16;
const TAG_BYTES = 32;

const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64').replace(/=+$/, '');

function derive(
  secret: string,
  salt: Uint8Array,
  options: { memory: number; passes: number; parallelism: number; tagLength: number },
): Promise<Buffer> {
  return argon2Async('argon2id', {
    message: Buffer.from(secret.normalize('NFKC'), 'utf8'),
    nonce: salt,
    ...options,
  });
}

/** Hashes a password into a self-describing PHC string: `$argon2id$v=19$m=…,t=…,p=…$salt$hash`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const tag = await derive(password, salt, {
    memory: MEMORY_KIB,
    passes: PASSES,
    parallelism: PARALLELISM,
    tagLength: TAG_BYTES,
  });
  return `$argon2id$v=19$m=${MEMORY_KIB},t=${PASSES},p=${PARALLELISM}$${b64(salt)}$${b64(tag)}`;
}

const PHC =
  /^\$argon2id\$v=19\$m=(\d{1,8}),t=(\d{1,3}),p=(\d{1,3})\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

/**
 * Checks a password against a stored hash in constant time. The cost parameters are read from
 * the hash itself, so hashes created with older settings keep verifying after a change.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const match = PHC.exec(storedHash);
  if (!match) return false;
  const [, memory, passes, parallelism, saltText = '', tagText = ''] = match;
  const salt = Buffer.from(saltText, 'base64');
  const expected = Buffer.from(tagText, 'base64');
  if (salt.length < 8 || expected.length < 16) return false;
  try {
    const actual = await derive(password, salt, {
      memory: Number(memory),
      passes: Number(passes),
      parallelism: Number(parallelism),
      tagLength: expected.length,
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// No 0/O, 1/I/L: the code is written down on paper and typed back in.
const RECOVERY_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const RECOVERY_LENGTH = 16;

/** A random one-time recovery code such as `ABCD-EFGH-JKMN-PQRS` (about 79 bits). */
export function generateRecoveryCode(): string {
  let code = '';
  for (let index = 0; index < RECOVERY_LENGTH; index += 1) {
    if (index > 0 && index % 4 === 0) code += '-';
    code += RECOVERY_ALPHABET.charAt(randomInt(RECOVERY_ALPHABET.length));
  }
  return code;
}

/** Uppercases and drops separators and anything else that is not part of the code alphabet. */
export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^23456789ABCDEFGHJKMNPQRSTUVWXYZ]/g, '');
}

export function hashRecoveryCode(code: string): Promise<string> {
  return hashPassword(normalizeRecoveryCode(code));
}

export function verifyRecoveryCode(code: string, storedHash: string): Promise<boolean> {
  const normalized = normalizeRecoveryCode(code);
  if (normalized.length !== RECOVERY_LENGTH) return Promise.resolve(false);
  return verifyPassword(normalized, storedHash);
}
