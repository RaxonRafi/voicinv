import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, type EntityManager } from 'typeorm';

import { AppException, type AuthContext, ErrorCode, signAccessToken } from '../../common/index.js';
import { type Env } from '../../config/index.js';
import { ShopsService } from '../shops/index.js';
import { identifierOf, parseIdentifier, UsersService } from '../users/index.js';
import { AuthRepository } from './auth.repository.js';
import {
  generateRecoveryCode,
  hashPassword,
  hashRecoveryCode,
  verifyPassword,
  verifyRecoveryCode,
} from './crypto/password.js';
import { generateRefreshToken, hashRefreshToken } from './crypto/refresh-token.js';

export interface RegisterInput {
  identifier: string;
  password: string;
  shop: {
    id: string;
    name: string;
    currencyCode: string;
    defaultLanguage: string;
    invoicePrefix: string;
  };
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
}

export interface RegisterResult extends AuthTokens {
  userId: string;
  shopId: string;
  recoveryCode: string;
}

export interface MeResult {
  user: { id: string; identifier: string; createdAt: number };
  shop: {
    id: string;
    name: string;
    currencyCode: string;
    defaultLanguage: string;
    invoicePrefix: string;
  };
}

/**
 * How long an already exchanged refresh token may be exchanged again. Shops are often on
 * poor connections: when the response to a refresh is lost, the app retries with the old
 * token and must not be signed out for it. After the window, reuse is treated as theft.
 */
export const REFRESH_REUSE_GRACE_MS = 60_000;

const DAY_MS = 86_400_000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  /** Verified when the account does not exist, so both cases take the same time. */
  private decoyHash: Promise<string> | undefined;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly dataSource: DataSource,
    private readonly repository: AuthRepository,
    private readonly users: UsersService,
    private readonly shops: ShopsService,
  ) {}

  /** Creates the account and its shop in one transaction and signs the user in. */
  async register(input: RegisterInput): Promise<RegisterResult> {
    const identifier = this.identifierOrThrow(input.identifier);
    const recoveryCode = generateRecoveryCode();
    const [passwordHash, recoveryCodeHash] = await Promise.all([
      hashPassword(input.password),
      hashRecoveryCode(recoveryCode),
    ]);

    const result = await this.dataSource.transaction(async (manager) => {
      const user = await this.users.create({ identifier, passwordHash, recoveryCodeHash }, manager);
      const shop = await this.shops.create({ ...input.shop, ownerId: user.id }, manager);
      const tokens = await this.issueTokens({ userId: user.id, shopId: shop.id }, manager);
      return { ...tokens, userId: user.id, shopId: shop.id, recoveryCode };
    });
    this.logger.log('Account registered.');
    return result;
  }

  async login(input: { identifier: string; password: string }): Promise<AuthTokens> {
    const identifier = parseIdentifier(input.identifier);
    const user = identifier ? await this.users.findByIdentifier(identifier) : null;
    const passwordMatches = await verifyPassword(
      input.password,
      user ? user.passwordHash : await this.getDecoyHash(),
    );
    const shop = user && passwordMatches ? await this.shops.findByOwner(user.id) : null;
    if (!user || !passwordMatches || !shop) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.INVALID_CREDENTIALS,
        'Wrong phone number, email or password.',
      );
    }

    await this.repository.deleteExpired(user.id, new Date(Date.now() - DAY_MS));
    return this.issueTokens({ userId: user.id, shopId: shop.id });
  }

  /** Exchanges a refresh token for a new access token and a new refresh token. */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const now = new Date();
    const stored = await this.repository.findByHash(this.hash(refreshToken));
    if (!stored || stored.revokedAt || stored.expiresAt.getTime() <= now.getTime()) {
      throw this.invalidRefreshToken();
    }
    if (stored.rotatedAt && now.getTime() - stored.rotatedAt.getTime() > REFRESH_REUSE_GRACE_MS) {
      // An exchanged token came back long after its replacement was issued: someone else
      // holds a copy. End every session of the account; the owner signs in again.
      await this.repository.revokeAllForUser(stored.userId, now);
      this.logger.warn('Refresh token reuse detected; all sessions of the account were revoked.');
      throw this.invalidRefreshToken();
    }

    const shop = await this.shops.findByOwner(stored.userId);
    if (!shop) throw this.invalidRefreshToken();

    return this.dataSource.transaction(async (manager) => {
      await this.repository.markRotated(stored.id, now, manager);
      return this.issueTokens({ userId: stored.userId, shopId: shop.id }, manager);
    });
  }

  /** Revokes the refresh token. Unknown tokens are ignored, so signing out always succeeds. */
  async logout(refreshToken: string): Promise<void> {
    const stored = await this.repository.findByHash(this.hash(refreshToken));
    if (stored) await this.repository.revoke(stored.id, new Date());
  }

  /**
   * Resets the password with the one-time recovery code. The code is used up: a new one is
   * returned for the user to write down, and every existing session is signed out.
   */
  async recover(input: {
    identifier: string;
    recoveryCode: string;
    newPassword: string;
  }): Promise<{ recoveryCode: string }> {
    const identifier = parseIdentifier(input.identifier);
    const user = identifier ? await this.users.findByIdentifier(identifier) : null;
    const codeMatches = user
      ? await verifyRecoveryCode(input.recoveryCode, user.recoveryCodeHash)
      : (await verifyPassword(input.recoveryCode, await this.getDecoyHash())) && false;
    if (!user || !codeMatches) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.INVALID_RECOVERY_CODE,
        'Wrong phone number, email or recovery code.',
      );
    }

    const recoveryCode = generateRecoveryCode();
    const [passwordHash, recoveryCodeHash] = await Promise.all([
      hashPassword(input.newPassword),
      hashRecoveryCode(recoveryCode),
    ]);
    await this.dataSource.transaction(async (manager) => {
      await this.users.updateCredentials(user.id, { passwordHash, recoveryCodeHash }, manager);
      await this.repository.revokeAllForUser(user.id, new Date(), manager);
    });
    this.logger.log('Password reset with a recovery code.');
    return { recoveryCode };
  }

  /** The signed-in user and their shop. */
  async me(auth: AuthContext): Promise<MeResult> {
    const [user, shop] = await Promise.all([
      this.users.findById(auth.userId),
      this.shops.findByOwner(auth.userId),
    ]);
    // The account was deleted, or the token names a shop the user does not own.
    if (!user || !shop || shop.id !== auth.shopId) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.UNAUTHORIZED,
        'Sign in again to continue.',
      );
    }
    return {
      user: { id: user.id, identifier: identifierOf(user), createdAt: user.createdAt.getTime() },
      shop: {
        id: shop.id,
        name: shop.name,
        currencyCode: shop.currencyCode,
        defaultLanguage: shop.defaultLanguage,
        invoicePrefix: shop.invoicePrefix,
      },
    };
  }

  private async issueTokens(auth: AuthContext, manager?: EntityManager): Promise<AuthTokens> {
    const expiresIn = this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
    const refreshTtlMs = this.config.get('JWT_REFRESH_TTL_SECONDS', { infer: true }) * 1000;
    const refreshToken = generateRefreshToken();
    await this.repository.insertToken(
      {
        userId: auth.userId,
        tokenHash: this.hash(refreshToken),
        expiresAt: new Date(Date.now() + refreshTtlMs),
      },
      manager,
    );
    const secret = this.config.get('JWT_ACCESS_SECRET', { infer: true });
    return { accessToken: signAccessToken(auth, secret, expiresIn), refreshToken, expiresIn };
  }

  private hash(refreshToken: string): string {
    return hashRefreshToken(refreshToken, this.config.get('JWT_REFRESH_SECRET', { infer: true }));
  }

  private getDecoyHash(): Promise<string> {
    this.decoyHash ??= hashPassword(generateRefreshToken());
    return this.decoyHash;
  }

  private identifierOrThrow(raw: string) {
    const identifier = parseIdentifier(raw);
    if (!identifier) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_FAILED,
        'Enter a valid phone number or email address.',
      );
    }
    return identifier;
  }

  private invalidRefreshToken(): AppException {
    return new AppException(
      HttpStatus.UNAUTHORIZED,
      ErrorCode.INVALID_REFRESH_TOKEN,
      'Your session has ended. Sign in again.',
    );
  }
}
