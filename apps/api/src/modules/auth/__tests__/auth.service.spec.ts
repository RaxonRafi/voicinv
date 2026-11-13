import { type ConfigService } from '@nestjs/config';
import { type DataSource } from 'typeorm';

import { verifyAccessToken } from '../../../common/index.js';
import { type Env } from '../../../config/index.js';
import { type Shop, type ShopsService } from '../../shops/index.js';
import { type User, type UsersService } from '../../users/index.js';
import { type AuthRepository } from '../auth.repository.js';
import { AuthService, REFRESH_REUSE_GRACE_MS } from '../auth.service.js';
import { hashPassword, hashRecoveryCode } from '../crypto/password.js';
import { hashRefreshToken } from '../crypto/refresh-token.js';
import { type RefreshToken } from '../entities/refresh-token.entity.js';

const ACCESS_SECRET = 'unit-test-access-secret-with-enough-length';
const REFRESH_SECRET = 'unit-test-refresh-secret-with-enough-length';
const env: Partial<Env> = {
  JWT_ACCESS_SECRET: ACCESS_SECRET,
  JWT_REFRESH_SECRET: REFRESH_SECRET,
  JWT_ACCESS_TTL_SECONDS: 900,
  JWT_REFRESH_TTL_SECONDS: 3600,
};

const USER_ID = '0192f0c0-0000-7000-8000-000000000001';
const SHOP_ID = '0192f0c0-0000-7000-8000-000000000002';
const MANAGER = { manager: true };

async function userRow(overrides: Partial<User> = {}): Promise<User> {
  return {
    id: USER_ID,
    phone: '+8801712345678',
    email: null,
    passwordHash: await hashPassword('secret-password'),
    recoveryCodeHash: await hashRecoveryCode('ABCD-EFGH-JKMN-PQRS'),
    createdAt: new Date('2026-01-02T03:04:05Z'),
    updatedAt: new Date('2026-01-02T03:04:05Z'),
    ...overrides,
  };
}

const shopRow = { id: SHOP_ID, ownerId: USER_ID, name: 'Rahim Store' } as Shop;

function tokenRow(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id: 'token-1',
    userId: USER_ID,
    tokenHash: hashRefreshToken('the-token', REFRESH_SECRET),
    expiresAt: new Date(Date.now() + 60_000),
    rotatedAt: null,
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function setup() {
  const repository = {
    insertToken: vi.fn().mockResolvedValue(undefined),
    findByHash: vi.fn().mockResolvedValue(null),
    markRotated: vi.fn().mockResolvedValue(undefined),
    revoke: vi.fn().mockResolvedValue(undefined),
    revokeAllForUser: vi.fn().mockResolvedValue(undefined),
    deleteExpired: vi.fn().mockResolvedValue(undefined),
  };
  const users = {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    findByIdentifier: vi.fn().mockResolvedValue(null),
    updateCredentials: vi.fn().mockResolvedValue(undefined),
  };
  const shops = {
    create: vi.fn().mockResolvedValue(shopRow),
    findByOwner: vi.fn().mockResolvedValue(shopRow),
  };
  const transaction = vi.fn((run: (manager: unknown) => unknown) => run(MANAGER));
  const service = new AuthService(
    { get: (key: keyof Env) => env[key] } as unknown as ConfigService<Env, true>,
    { transaction } as unknown as DataSource,
    repository as unknown as AuthRepository,
    users as unknown as UsersService,
    shops as unknown as ShopsService,
  );
  return { service, repository, users, shops, transaction };
}

const shopInput = {
  id: SHOP_ID,
  name: 'Rahim Store',
  currencyCode: 'BDT',
  defaultLanguage: 'bn',
  invoicePrefix: 'RS',
};

describe('AuthService', () => {
  describe('register', () => {
    it('creates the user, the shop and a session in one transaction', async () => {
      const { service, repository, users, shops, transaction } = setup();
      users.create.mockResolvedValue(await userRow());

      const result = await service.register({
        identifier: '+880 1712-345678',
        password: 'secret-password',
        shop: shopInput,
      });

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(users.create).toHaveBeenCalledWith(
        {
          identifier: { kind: 'phone', value: '+8801712345678' },
          passwordHash: expect.stringMatching(/^\$argon2id\$/),
          recoveryCodeHash: expect.stringMatching(/^\$argon2id\$/),
        },
        MANAGER,
      );
      expect(shops.create).toHaveBeenCalledWith({ ...shopInput, ownerId: USER_ID }, MANAGER);
      expect(repository.insertToken).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID }),
        MANAGER,
      );

      expect(result).toMatchObject({ userId: USER_ID, shopId: SHOP_ID, expiresIn: 900 });
      expect(result.recoveryCode).toMatch(/^([2-9A-HJKMNP-Z]{4}-){3}[2-9A-HJKMNP-Z]{4}$/);
      expect(verifyAccessToken(result.accessToken, ACCESS_SECRET)).toEqual({
        userId: USER_ID,
        shopId: SHOP_ID,
      });
    });

    it('never stores the password, the recovery code or the refresh token in the clear', async () => {
      const { service, repository, users } = setup();
      users.create.mockResolvedValue(await userRow());

      const result = await service.register({
        identifier: 'karim@example.com',
        password: 'secret-password',
        shop: shopInput,
      });

      const stored = JSON.stringify([users.create.mock.calls, repository.insertToken.mock.calls]);
      expect(stored).not.toContain('secret-password');
      expect(stored).not.toContain(result.recoveryCode);
      expect(stored).not.toContain(result.refreshToken);
      expect(repository.insertToken.mock.calls[0]?.[0]).toMatchObject({
        tokenHash: hashRefreshToken(result.refreshToken, REFRESH_SECRET),
      });
    });

    it('rejects an identifier that is neither a phone number nor an email', async () => {
      const { service, transaction } = setup();
      await expect(
        service.register({ identifier: 'karim', password: 'secret-password', shop: shopInput }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(transaction).not.toHaveBeenCalled();
    });

    it('propagates a taken identifier from the users module', async () => {
      const { service, users, shops } = setup();
      users.create.mockRejectedValue(
        Object.assign(new Error('taken'), { code: 'IDENTIFIER_TAKEN' }),
      );

      await expect(
        service.register({
          identifier: 'a@example.com',
          password: 'secret-password',
          shop: shopInput,
        }),
      ).rejects.toMatchObject({ code: 'IDENTIFIER_TAKEN' });
      expect(shops.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('signs in with the right password, however the identifier is formatted', async () => {
      const { service, users, repository } = setup();
      users.findByIdentifier.mockResolvedValue(await userRow());

      const tokens = await service.login({
        identifier: '+880 1712 345678',
        password: 'secret-password',
      });

      expect(users.findByIdentifier).toHaveBeenCalledWith({
        kind: 'phone',
        value: '+8801712345678',
      });
      expect(verifyAccessToken(tokens.accessToken, ACCESS_SECRET)).toEqual({
        userId: USER_ID,
        shopId: SHOP_ID,
      });
      expect(repository.insertToken).toHaveBeenCalledTimes(1);
      expect(repository.deleteExpired).toHaveBeenCalledWith(USER_ID, expect.any(Date));
    });

    it.each([
      ['a wrong password', '+8801712345678', 'wrong-password', true],
      ['an unknown account', '+8801999999999', 'secret-password', false],
      ['a malformed identifier', 'karim', 'secret-password', false],
    ])('answers %s with the same error', async (_case, identifier, password, exists) => {
      const { service, users, repository } = setup();
      users.findByIdentifier.mockResolvedValue(exists ? await userRow() : null);

      await expect(service.login({ identifier, password })).rejects.toMatchObject({
        code: 'INVALID_CREDENTIALS',
        message: 'Wrong phone number, email or password.',
      });
      expect(repository.insertToken).not.toHaveBeenCalled();
    });

    it('refuses an account that has no shop', async () => {
      const { service, users, shops } = setup();
      users.findByIdentifier.mockResolvedValue(await userRow());
      shops.findByOwner.mockResolvedValue(null);

      await expect(
        service.login({ identifier: '+8801712345678', password: 'secret-password' }),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    });
  });

  describe('refresh', () => {
    it('exchanges a valid token for a new pair and marks the old one rotated', async () => {
      const { service, repository } = setup();
      repository.findByHash.mockResolvedValue(tokenRow());

      const tokens = await service.refresh('the-token');

      expect(repository.findByHash).toHaveBeenCalledWith(
        hashRefreshToken('the-token', REFRESH_SECRET),
      );
      expect(repository.markRotated).toHaveBeenCalledWith('token-1', expect.any(Date), MANAGER);
      expect(repository.insertToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          tokenHash: hashRefreshToken(tokens.refreshToken, REFRESH_SECRET),
        }),
        MANAGER,
      );
      expect(tokens.refreshToken).not.toBe('the-token');
    });

    it.each([
      ['unknown', null],
      ['expired', tokenRow({ expiresAt: new Date(Date.now() - 1) })],
      ['revoked', tokenRow({ revokedAt: new Date() })],
    ])('rejects an %s token', async (_case, stored) => {
      const { service, repository } = setup();
      repository.findByHash.mockResolvedValue(stored);

      await expect(service.refresh('the-token')).rejects.toMatchObject({
        code: 'INVALID_REFRESH_TOKEN',
      });
      expect(repository.insertToken).not.toHaveBeenCalled();
      expect(repository.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('lets a just-rotated token be retried (lost response on a poor connection)', async () => {
      const { service, repository } = setup();
      repository.findByHash.mockResolvedValue(
        tokenRow({ rotatedAt: new Date(Date.now() - REFRESH_REUSE_GRACE_MS + 5_000) }),
      );

      await expect(service.refresh('the-token')).resolves.toMatchObject({ expiresIn: 900 });
      expect(repository.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('treats late reuse of a rotated token as theft and ends every session', async () => {
      const { service, repository } = setup();
      repository.findByHash.mockResolvedValue(
        tokenRow({ rotatedAt: new Date(Date.now() - REFRESH_REUSE_GRACE_MS - 5_000) }),
      );

      await expect(service.refresh('the-token')).rejects.toMatchObject({
        code: 'INVALID_REFRESH_TOKEN',
      });
      expect(repository.revokeAllForUser).toHaveBeenCalledWith(USER_ID, expect.any(Date));
      expect(repository.insertToken).not.toHaveBeenCalled();
    });

    it('rejects a token whose account no longer has a shop', async () => {
      const { service, repository, shops } = setup();
      repository.findByHash.mockResolvedValue(tokenRow());
      shops.findByOwner.mockResolvedValue(null);

      await expect(service.refresh('the-token')).rejects.toMatchObject({
        code: 'INVALID_REFRESH_TOKEN',
      });
    });
  });

  describe('logout', () => {
    it('revokes the token', async () => {
      const { service, repository } = setup();
      repository.findByHash.mockResolvedValue(tokenRow());

      await service.logout('the-token');
      expect(repository.revoke).toHaveBeenCalledWith('token-1', expect.any(Date));
    });

    it('succeeds quietly for an unknown token', async () => {
      const { service, repository } = setup();
      await expect(service.logout('nope')).resolves.toBeUndefined();
      expect(repository.revoke).not.toHaveBeenCalled();
    });
  });

  describe('recover', () => {
    it('resets the password, issues a new recovery code and ends every session', async () => {
      const { service, repository, users } = setup();
      users.findByIdentifier.mockResolvedValue(await userRow());

      const result = await service.recover({
        identifier: '+8801712345678',
        recoveryCode: 'abcd efgh jkmn pqrs',
        newPassword: 'a-new-password',
      });

      expect(result.recoveryCode).toMatch(/^([2-9A-HJKMNP-Z]{4}-){3}[2-9A-HJKMNP-Z]{4}$/);
      expect(result.recoveryCode).not.toBe('ABCD-EFGH-JKMN-PQRS');
      expect(users.updateCredentials).toHaveBeenCalledWith(
        USER_ID,
        {
          passwordHash: expect.stringMatching(/^\$argon2id\$/),
          recoveryCodeHash: expect.stringMatching(/^\$argon2id\$/),
        },
        MANAGER,
      );
      expect(repository.revokeAllForUser).toHaveBeenCalledWith(USER_ID, expect.any(Date), MANAGER);
    });

    it.each([
      ['a wrong code', '+8801712345678', 'ABCD-EFGH-JKMN-PQRT', true],
      ['an unknown account', '+8801999999999', 'ABCD-EFGH-JKMN-PQRS', false],
    ])(
      'answers %s with the same error and changes nothing',
      async (_case, identifier, code, exists) => {
        const { service, users, repository } = setup();
        users.findByIdentifier.mockResolvedValue(exists ? await userRow() : null);

        await expect(
          service.recover({ identifier, recoveryCode: code, newPassword: 'a-new-password' }),
        ).rejects.toMatchObject({
          code: 'INVALID_RECOVERY_CODE',
          message: 'Wrong phone number, email or recovery code.',
        });
        expect(users.updateCredentials).not.toHaveBeenCalled();
        expect(repository.revokeAllForUser).not.toHaveBeenCalled();
      },
    );
  });

  describe('me', () => {
    const auth = { userId: USER_ID, shopId: SHOP_ID };

    it('returns the user and their shop', async () => {
      const { service, users, shops } = setup();
      users.findById.mockResolvedValue(await userRow());
      shops.findByOwner.mockResolvedValue({
        ...shopRow,
        currencyCode: 'BDT',
        defaultLanguage: 'bn',
        invoicePrefix: 'RS',
      });

      await expect(service.me(auth)).resolves.toEqual({
        user: {
          id: USER_ID,
          identifier: '+8801712345678',
          createdAt: Date.parse('2026-01-02T03:04:05Z'),
        },
        shop: {
          id: SHOP_ID,
          name: 'Rahim Store',
          currencyCode: 'BDT',
          defaultLanguage: 'bn',
          invoicePrefix: 'RS',
        },
      });
    });

    it('rejects a token for a deleted account or for a shop the user does not own', async () => {
      const { service, users, shops } = setup();
      await expect(service.me(auth)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

      users.findById.mockResolvedValue(await userRow());
      shops.findByOwner.mockResolvedValue({ ...shopRow, id: 'another-shop' });
      await expect(service.me(auth)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });
  });
});
