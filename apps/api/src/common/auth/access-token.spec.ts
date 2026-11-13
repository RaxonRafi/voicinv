import jwt from 'jsonwebtoken';

import { signAccessToken, verifyAccessToken } from './access-token.js';

const SECRET = 'unit-test-access-secret-with-enough-length';
const auth = { userId: '0192f0c0-0000-7000-8000-000000000001', shopId: 'shop-1' };

describe('access tokens', () => {
  it('round-trips the caller identity', () => {
    const token = signAccessToken(auth, SECRET, 900);
    expect(verifyAccessToken(token, SECRET)).toEqual(auth);
  });

  it('rejects a token signed with another secret', () => {
    const token = signAccessToken(auth, 'a-different-secret-with-enough-length!!', 900);
    expect(verifyAccessToken(token, SECRET)).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = signAccessToken(auth, SECRET, -1);
    expect(verifyAccessToken(token, SECRET)).toBeNull();
  });

  it('rejects garbage and empty input', () => {
    expect(verifyAccessToken('not-a-jwt', SECRET)).toBeNull();
    expect(verifyAccessToken('', SECRET)).toBeNull();
  });

  it('rejects unsigned tokens (alg none)', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({ sub: auth.userId, shopId: auth.shopId, iss: 'voiceledger-api' }),
    ).toString('base64url');
    expect(verifyAccessToken(`${header}.${body}.`, SECRET)).toBeNull();
  });

  it('rejects tokens from another issuer or without a shop', () => {
    const otherIssuer = jwt.sign({ shopId: auth.shopId }, SECRET, {
      subject: auth.userId,
      issuer: 'someone-else',
    });
    const noShop = jwt.sign({}, SECRET, { subject: auth.userId, issuer: 'voiceledger-api' });
    expect(verifyAccessToken(otherIssuer, SECRET)).toBeNull();
    expect(verifyAccessToken(noShop, SECRET)).toBeNull();
  });
});
