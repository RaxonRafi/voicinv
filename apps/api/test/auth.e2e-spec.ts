import { randomUUID } from 'node:crypto';

import request from 'supertest';

import { createAccount, post, registerBody } from './support/accounts.js';
import { createTestApp, nextClientIp, type TestApp } from './support/test-app.js';

describe('accounts: /auth and /me (e2e)', () => {
  let testApp: TestApp;

  const me = (accessToken?: string) => {
    const call = request(testApp.server).get('/api/v1/me').set('X-Forwarded-For', nextClientIp());
    return accessToken ? call.set('Authorization', `Bearer ${accessToken}`) : call;
  };

  const count = async (table: string, where = 'true', params: unknown[] = []): Promise<number> => {
    const [row]: { n: string }[] = await testApp.dataSource.query(
      `SELECT count(*) AS n FROM ${table} WHERE ${where}`,
      params,
    );
    return Number(row?.n);
  };

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  describe('POST /auth/register', () => {
    it('creates the account and its shop and signs the user in', async () => {
      const body = registerBody({ identifier: ' Karim@Example.COM ' });
      const response = await post(testApp, '/auth/register', body);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        data: {
          accessToken: expect.any(String),
          refreshToken: expect.any(String),
          expiresIn: 900,
          userId: expect.stringMatching(/^[0-9a-f-]{36}$/),
          shopId: body.shop.id,
          recoveryCode: expect.stringMatching(/^([2-9A-HJKMNP-Z]{4}-){3}[2-9A-HJKMNP-Z]{4}$/),
        },
      });

      const profile = await me(response.body.data.accessToken);
      expect(profile.status).toBe(200);
      expect(profile.body).toEqual({
        data: {
          user: {
            id: response.body.data.userId,
            identifier: 'karim@example.com',
            createdAt: expect.any(Number),
          },
          shop: {
            id: body.shop.id,
            name: body.shop.name,
            currencyCode: 'BDT',
            defaultLanguage: 'bn',
            invoicePrefix: 'RS',
          },
        },
      });
    });

    it('stores only hashes of the password, recovery code and refresh token', async () => {
      const account = await createAccount(testApp);

      const [user]: { password_hash: string; recovery_code_hash: string }[] =
        await testApp.dataSource.query(
          'SELECT password_hash, recovery_code_hash FROM users WHERE id = $1',
          [account.userId],
        );
      const tokens: { token_hash: string }[] = await testApp.dataSource.query(
        'SELECT token_hash FROM refresh_tokens WHERE user_id = $1',
        [account.userId],
      );

      expect(user?.password_hash).toMatch(/^\$argon2id\$/);
      expect(user?.recovery_code_hash).toMatch(/^\$argon2id\$/);
      expect(user?.password_hash).not.toContain(account.password);
      expect(tokens).toHaveLength(1);
      expect(tokens[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(tokens[0]?.token_hash).not.toBe(account.refreshToken);
    });

    it('accepts a phone number as the identifier', async () => {
      const phone = `+88017${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
      const account = await createAccount(testApp, { identifier: phone });

      const profile = await me(account.accessToken);
      expect(profile.body.data.user.identifier).toBe(phone);
    });

    it('refuses an identifier that already has an account, however it is written', async () => {
      const account = await createAccount(testApp);
      const response = await post(
        testApp,
        '/auth/register',
        registerBody({ identifier: account.identifier.toUpperCase() }),
      );

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('IDENTIFIER_TAKEN');
    });

    it('refuses a shop that already belongs to an account and leaves no half-made account', async () => {
      const account = await createAccount(testApp);
      const body = registerBody();
      const response = await post(testApp, '/auth/register', {
        ...body,
        shop: { ...body.shop, id: account.shopId },
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CONFLICT');
      expect(await count('users', 'email = $1', [body.identifier])).toBe(0);
    });

    it('never lets a second sign-up take over a shop, even when both arrive at once', async () => {
      const first = registerBody();
      const second = { ...registerBody(), shop: first.shop };
      const responses = await Promise.all([
        post(testApp, '/auth/register', first),
        post(testApp, '/auth/register', second),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      const winner = responses.find((response) => response.status === 201);
      const [shop]: { owner_id: string }[] = await testApp.dataSource.query(
        'SELECT owner_id FROM shops WHERE id = $1',
        [first.shop.id],
      );
      expect(shop?.owner_id).toBe(winner?.body.data.userId);
      expect(await count('users', 'email IN ($1, $2)', [first.identifier, second.identifier])).toBe(
        1,
      );
    });

    it('creates exactly one account when the same sign-up is sent twice at once', async () => {
      const body = registerBody();
      const responses = await Promise.all([
        post(testApp, '/auth/register', body),
        post(testApp, '/auth/register', body),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      expect(await count('users', 'email = $1', [body.identifier])).toBe(1);
      expect(await count('shops', 'id = $1', [body.shop.id])).toBe(1);
    });

    it.each([
      ['a malformed identifier', { identifier: 'karim' }, 'identifier'],
      ['a short password', { password: 'short' }, 'password'],
      ['a missing shop', { shop: undefined }, 'shop'],
      ['a shop ID that is not a UUID', { shop: { ...registerBody().shop, id: 'x' } }, 'shop.id'],
      [
        'an unsupported language',
        { shop: { ...registerBody().shop, defaultLanguage: 'fr' } },
        'shop.defaultLanguage',
      ],
      [
        'a lowercase invoice prefix',
        { shop: { ...registerBody().shop, invoicePrefix: 'rs' } },
        'shop.invoicePrefix',
      ],
      ['an unknown property', { isAdmin: true }, 'isAdmin'],
    ])('rejects %s', async (_case, overrides, field) => {
      const response = await post(testApp, '/auth/register', { ...registerBody(), ...overrides });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field })]),
      );
    });
  });

  describe('POST /auth/login', () => {
    it('signs in with the right password', async () => {
      const account = await createAccount(testApp);
      const response = await post(testApp, '/auth/login', {
        identifier: account.identifier,
        password: account.password,
      });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        expiresIn: 900,
      });
      expect((await me(response.body.data.accessToken)).body.data.shop.id).toBe(account.shopId);
    });

    it('answers a wrong password and an unknown account identically', async () => {
      const account = await createAccount(testApp);
      const wrongPassword = await post(testApp, '/auth/login', {
        identifier: account.identifier,
        password: 'not the password',
      });
      const unknownAccount = await post(testApp, '/auth/login', {
        identifier: 'nobody@example.com',
        password: account.password,
      });

      expect(wrongPassword.status).toBe(401);
      expect(wrongPassword.body).toEqual({
        error: { code: 'INVALID_CREDENTIALS', message: expect.any(String) },
      });
      expect(unknownAccount.status).toBe(401);
      expect(unknownAccount.body).toEqual(wrongPassword.body);
    });

    it('rate limits sign-in attempts per client IP', async () => {
      const ip = nextClientIp();
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 11; attempt += 1) {
        const response = await request(testApp.server)
          .post('/api/v1/auth/login')
          .set('X-Forwarded-For', ip)
          .send({ identifier: 'nobody@example.com', password: 'guess' });
        statuses.push(response.status);
      }

      expect(statuses.slice(0, 10)).toEqual(Array.from({ length: 10 }, () => 401));
      expect(statuses[10]).toBe(429);
    });
  });

  describe('GET /me', () => {
    it.each([
      ['no token', undefined],
      ['a malformed token', 'not-a-token'],
      ['a refresh token', 'refresh'],
    ])('rejects %s', async (_case, token) => {
      const account = await createAccount(testApp);
      const response = await me(token === 'refresh' ? account.refreshToken : token);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: { code: 'UNAUTHORIZED', message: expect.any(String) },
      });
    });

    it('never shows one user another user’s account', async () => {
      const first = await createAccount(testApp);
      const second = await createAccount(testApp);

      const firstProfile = await me(first.accessToken);
      const secondProfile = await me(second.accessToken);

      expect(firstProfile.body.data.user.id).toBe(first.userId);
      expect(firstProfile.body.data.shop.id).toBe(first.shopId);
      expect(secondProfile.body.data.user.id).toBe(second.userId);
      expect(secondProfile.body.data.shop.id).toBe(second.shopId);
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates the refresh token', async () => {
      const account = await createAccount(testApp);
      const response = await post(testApp, '/auth/refresh', { refreshToken: account.refreshToken });

      expect(response.status).toBe(200);
      expect(response.body.data.refreshToken).not.toBe(account.refreshToken);
      expect((await me(response.body.data.accessToken)).status).toBe(200);

      const next = await post(testApp, '/auth/refresh', {
        refreshToken: response.body.data.refreshToken,
      });
      expect(next.status).toBe(200);
    });

    it('lets the old token be retried right after rotation (lost response)', async () => {
      const account = await createAccount(testApp);
      const first = await post(testApp, '/auth/refresh', { refreshToken: account.refreshToken });
      const retry = await post(testApp, '/auth/refresh', { refreshToken: account.refreshToken });

      expect(first.status).toBe(200);
      expect(retry.status).toBe(200);
    });

    it('ends every session when a rotated token is reused later', async () => {
      const account = await createAccount(testApp);
      const rotated = await post(testApp, '/auth/refresh', { refreshToken: account.refreshToken });
      await testApp.dataSource.query(
        `UPDATE refresh_tokens SET rotated_at = now() - interval '5 minutes'
         WHERE user_id = $1 AND rotated_at IS NOT NULL`,
        [account.userId],
      );

      const reuse = await post(testApp, '/auth/refresh', { refreshToken: account.refreshToken });
      expect(reuse.status).toBe(401);
      expect(reuse.body.error.code).toBe('INVALID_REFRESH_TOKEN');

      const stolenChain = await post(testApp, '/auth/refresh', {
        refreshToken: rotated.body.data.refreshToken,
      });
      expect(stolenChain.status).toBe(401);
    });

    it('rejects unknown and expired tokens', async () => {
      const account = await createAccount(testApp);
      const unknown = await post(testApp, '/auth/refresh', { refreshToken: 'made-up-token' });
      expect(unknown.status).toBe(401);
      expect(unknown.body.error.code).toBe('INVALID_REFRESH_TOKEN');

      await testApp.dataSource.query(
        `UPDATE refresh_tokens SET expires_at = now() - interval '1 second' WHERE user_id = $1`,
        [account.userId],
      );
      const expired = await post(testApp, '/auth/refresh', { refreshToken: account.refreshToken });
      expect(expired.status).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the refresh token', async () => {
      const account = await createAccount(testApp);
      const response = await post(testApp, '/auth/logout', { refreshToken: account.refreshToken });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: { loggedOut: true } });

      const refresh = await post(testApp, '/auth/refresh', { refreshToken: account.refreshToken });
      expect(refresh.status).toBe(401);
    });

    it('succeeds for a token it does not know', async () => {
      const response = await post(testApp, '/auth/logout', { refreshToken: randomUUID() });
      expect(response.status).toBe(200);
    });
  });

  describe('POST /auth/recover', () => {
    it('resets the password, replaces the recovery code and signs out other sessions', async () => {
      const account = await createAccount(testApp);
      const response = await post(testApp, '/auth/recover', {
        identifier: account.identifier,
        recoveryCode: account.recoveryCode.toLowerCase().replaceAll('-', ' '),
        newPassword: 'a brand new password',
      });

      expect(response.status).toBe(200);
      expect(response.body.data.recoveryCode).toMatch(
        /^([2-9A-HJKMNP-Z]{4}-){3}[2-9A-HJKMNP-Z]{4}$/,
      );
      expect(response.body.data.recoveryCode).not.toBe(account.recoveryCode);

      const oldPassword = await post(testApp, '/auth/login', {
        identifier: account.identifier,
        password: account.password,
      });
      const newPassword = await post(testApp, '/auth/login', {
        identifier: account.identifier,
        password: 'a brand new password',
      });
      const oldSession = await post(testApp, '/auth/refresh', {
        refreshToken: account.refreshToken,
      });
      expect(oldPassword.status).toBe(401);
      expect(newPassword.status).toBe(200);
      expect(oldSession.status).toBe(401);

      const usedCode = await post(testApp, '/auth/recover', {
        identifier: account.identifier,
        recoveryCode: account.recoveryCode,
        newPassword: 'yet another password',
      });
      expect(usedCode.status).toBe(401);
      expect(usedCode.body.error.code).toBe('INVALID_RECOVERY_CODE');
    });

    it('answers a wrong code and an unknown account identically', async () => {
      const account = await createAccount(testApp);
      const wrongCode = await post(testApp, '/auth/recover', {
        identifier: account.identifier,
        recoveryCode: 'AAAA-BBBB-CCCC-DDDD',
        newPassword: 'a brand new password',
      });
      const unknownAccount = await post(testApp, '/auth/recover', {
        identifier: 'nobody@example.com',
        recoveryCode: account.recoveryCode,
        newPassword: 'a brand new password',
      });

      expect(wrongCode.status).toBe(401);
      expect(unknownAccount.status).toBe(401);
      expect(unknownAccount.body).toEqual(wrongCode.body);

      const stillWorks = await post(testApp, '/auth/login', {
        identifier: account.identifier,
        password: account.password,
      });
      expect(stillWorks.status).toBe(200);
    });
  });
});
