import {
  generateRecoveryCode,
  hashPassword,
  hashRecoveryCode,
  normalizeRecoveryCode,
  verifyPassword,
  verifyRecoveryCode,
} from '../crypto/password.js';
import { generateRefreshToken, hashRefreshToken } from '../crypto/refresh-token.js';

describe('password hashing', () => {
  it('produces an Argon2id PHC string and verifies the right password', async () => {
    const hash = await hashPassword('correct horse battery staple');

    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/);
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
    await expect(verifyPassword('correct horse battery stapl', hash)).resolves.toBe(false);
  });

  it('salts every hash', async () => {
    const [first, second] = await Promise.all([hashPassword('same'), hashPassword('same')]);
    expect(first).not.toBe(second);
  });

  it('handles Bengali passwords and Unicode normalization forms', async () => {
    const hash = await hashPassword('পাসওয়ার্ড১২৩');
    await expect(verifyPassword('পাসওয়ার্ড১২৩', hash)).resolves.toBe(true);

    // "é" precomposed and as "e" + combining accent are the same password.
    const accented = await hashPassword('café-secret');
    await expect(verifyPassword('café-secret', accented)).resolves.toBe(true);
  });

  it('verifies hashes made with other cost parameters', async () => {
    // Argon2id of "password" with m=8 KiB, t=1, p=1 — parameters come from the hash itself.
    const { argon2Sync } = await import('node:crypto');
    const salt = Buffer.from('0123456789abcdef');
    const tag = argon2Sync('argon2id', {
      message: Buffer.from('password'),
      nonce: salt,
      memory: 8,
      passes: 1,
      parallelism: 1,
      tagLength: 32,
    });
    const b64 = (bytes: Buffer) => bytes.toString('base64').replace(/=+$/, '');
    const hash = `$argon2id$v=19$m=8,t=1,p=1$${b64(salt)}$${b64(tag)}`;

    await expect(verifyPassword('password', hash)).resolves.toBe(true);
    await expect(verifyPassword('Password', hash)).resolves.toBe(false);
  });

  it('rejects malformed stored hashes instead of throwing', async () => {
    await expect(verifyPassword('x', '')).resolves.toBe(false);
    await expect(verifyPassword('x', 'scrypt:aa:bb')).resolves.toBe(false);
    await expect(verifyPassword('x', '$argon2id$v=19$m=0,t=0,p=0$AAAAAAAAAAA$AAAA')).resolves.toBe(
      false,
    );
  });
});

describe('recovery codes', () => {
  it('generates grouped codes without ambiguous characters', () => {
    const codes = Array.from({ length: 50 }, generateRecoveryCode);
    for (const code of codes) {
      expect(code).toMatch(/^([2-9A-HJKMNP-Z]{4}-){3}[2-9A-HJKMNP-Z]{4}$/);
    }
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('accepts the code however it is typed back', async () => {
    const code = generateRecoveryCode();
    const hash = await hashRecoveryCode(code);

    await expect(verifyRecoveryCode(code, hash)).resolves.toBe(true);
    await expect(verifyRecoveryCode(code.toLowerCase().replaceAll('-', ' '), hash)).resolves.toBe(
      true,
    );
    await expect(verifyRecoveryCode(` ${code} `, hash)).resolves.toBe(true);
  });

  it('rejects a wrong or incomplete code', async () => {
    const hash = await hashRecoveryCode('ABCD-EFGH-JKMN-PQRS');
    await expect(verifyRecoveryCode('ABCD-EFGH-JKMN-PQRT', hash)).resolves.toBe(false);
    await expect(verifyRecoveryCode('ABCD-EFGH', hash)).resolves.toBe(false);
    await expect(verifyRecoveryCode('', hash)).resolves.toBe(false);
  });

  it('normalizes by dropping everything outside the code alphabet', () => {
    expect(normalizeRecoveryCode('abcd-efgh jkmn_pqrs')).toBe('ABCDEFGHJKMNPQRS');
  });
});

describe('refresh tokens', () => {
  it('generates long, unique, URL-safe tokens', () => {
    const tokens = Array.from({ length: 50 }, generateRefreshToken);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('hashes deterministically under a key', () => {
    const token = generateRefreshToken();
    const hash = hashRefreshToken(token, 'key-one');

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken(token, 'key-one')).toBe(hash);
    expect(hashRefreshToken(token, 'key-two')).not.toBe(hash);
    expect(hashRefreshToken(`${token}x`, 'key-one')).not.toBe(hash);
  });
});
