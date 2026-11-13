import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, IsNull, LessThan, Repository } from 'typeorm';

import { RefreshToken } from './entities/refresh-token.entity.js';

/** All TypeORM access for the auth module. Pass `manager` to take part in a transaction. */
@Injectable()
export class AuthRepository {
  constructor(@InjectRepository(RefreshToken) private readonly tokens: Repository<RefreshToken>) {}

  private repo(manager?: EntityManager): Repository<RefreshToken> {
    return manager ? manager.getRepository(RefreshToken) : this.tokens;
  }

  async insertToken(
    token: { userId: string; tokenHash: string; expiresAt: Date },
    manager?: EntityManager,
  ): Promise<void> {
    await this.repo(manager).insert({ ...token, rotatedAt: null, revokedAt: null });
  }

  findByHash(tokenHash: string, manager?: EntityManager): Promise<RefreshToken | null> {
    return this.repo(manager).findOneBy({ tokenHash });
  }

  /** Marks a token as exchanged. Keeps the first timestamp if it was already rotated. */
  async markRotated(id: string, at: Date, manager?: EntityManager): Promise<void> {
    await this.repo(manager).update({ id, rotatedAt: IsNull() }, { rotatedAt: at });
  }

  async revoke(id: string, at: Date, manager?: EntityManager): Promise<void> {
    await this.repo(manager).update({ id, revokedAt: IsNull() }, { revokedAt: at });
  }

  /** Signs the user out everywhere. */
  async revokeAllForUser(userId: string, at: Date, manager?: EntityManager): Promise<void> {
    await this.repo(manager).update({ userId, revokedAt: IsNull() }, { revokedAt: at });
  }

  /** Housekeeping: removes the user's tokens that expired before `before`. */
  async deleteExpired(userId: string, before: Date, manager?: EntityManager): Promise<void> {
    await this.repo(manager).delete({ userId, expiresAt: LessThan(before) });
  }
}
