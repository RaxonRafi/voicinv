import jwt from 'jsonwebtoken';

/** Who is calling: set on the request by `AuthGuard` from a verified access token. */
export interface AuthContext {
  userId: string;
  /** The shop the user owns. Every query for this request is scoped to it. */
  shopId: string;
}

const ALGORITHM = 'HS256';
const ISSUER = 'voiceledger-api';

/** Signs a short-lived access token. The shop is taken from the database, never from the client. */
export function signAccessToken(auth: AuthContext, secret: string, ttlSeconds: number): string {
  return jwt.sign({ shopId: auth.shopId }, secret, {
    algorithm: ALGORITHM,
    issuer: ISSUER,
    subject: auth.userId,
    expiresIn: ttlSeconds,
  });
}

/** Returns the caller's identity, or null when the token is missing, malformed, forged or expired. */
export function verifyAccessToken(token: string, secret: string): AuthContext | null {
  try {
    const payload = jwt.verify(token, secret, { algorithms: [ALGORITHM], issuer: ISSUER });
    if (typeof payload === 'string') return null;
    const { sub, shopId } = payload as { sub?: unknown; shopId?: unknown };
    if (typeof sub !== 'string' || typeof shopId !== 'string') return null;
    return { userId: sub, shopId };
  } catch {
    return null;
  }
}
