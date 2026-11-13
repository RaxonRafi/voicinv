import { createHmac, randomBytes } from 'node:crypto';

/** A new opaque refresh token: 256 random bits, URL-safe. Only its hash is ever stored. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Keyed hash (HMAC-SHA-256, hex) under which a refresh token is stored and looked up. With
 * the key held outside the database, a leaked table cannot be used to forge or verify tokens.
 */
export function hashRefreshToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}
