import { HttpStatus, Injectable } from '@nestjs/common';
import { type EntityManager } from 'typeorm';

import { AppException, ErrorCode } from '../../common/index.js';
import { uniqueViolationConstraint } from '../../database/errors.js';
import { createUuidV7Generator } from '../../shared/index.js';
import { type User } from './entities/user.entity.js';
import { type Identifier } from './identifier.js';
import { UsersRepository } from './users.repository.js';

export interface CreateUserInput {
  identifier: Identifier;
  passwordHash: string;
  recoveryCodeHash: string;
}

const newUserId = createUuidV7Generator();

/** The identifier a user signs in with (their phone number or email address). */
export function identifierOf(user: Pick<User, 'phone' | 'email'>): string {
  return user.email ?? user.phone ?? '';
}

@Injectable()
export class UsersService {
  constructor(private readonly repository: UsersRepository) {}

  /** Creates an account. Fails with `IDENTIFIER_TAKEN` when the phone or email is in use. */
  async create(input: CreateUserInput, manager?: EntityManager): Promise<User> {
    try {
      return await this.repository.insert({ id: newUserId(), ...input }, manager);
    } catch (error) {
      if (uniqueViolationConstraint(error) !== null) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.IDENTIFIER_TAKEN,
          'An account with this phone number or email already exists.',
        );
      }
      throw error;
    }
  }

  findById(id: string, manager?: EntityManager): Promise<User | null> {
    return this.repository.findById(id, manager);
  }

  findByIdentifier(identifier: Identifier, manager?: EntityManager): Promise<User | null> {
    return this.repository.findByIdentifier(identifier, manager);
  }

  /** Replaces the password and the one-time recovery code together (password reset). */
  updateCredentials(
    userId: string,
    credentials: { passwordHash: string; recoveryCodeHash: string },
    manager?: EntityManager,
  ): Promise<void> {
    return this.repository.updateCredentials(userId, credentials, manager);
  }
}
