import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, Repository } from 'typeorm';

import { User } from './entities/user.entity.js';
import { type Identifier } from './identifier.js';

export interface NewUser {
  id: string;
  identifier: Identifier;
  passwordHash: string;
  recoveryCodeHash: string;
}

/** All TypeORM access for the users module. Pass `manager` to take part in a transaction. */
@Injectable()
export class UsersRepository {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  private repo(manager?: EntityManager): Repository<User> {
    return manager ? manager.getRepository(User) : this.users;
  }

  async insert(user: NewUser, manager?: EntityManager): Promise<User> {
    const { identifier } = user;
    const row = this.repo(manager).create({
      id: user.id,
      phone: identifier.kind === 'phone' ? identifier.value : null,
      email: identifier.kind === 'email' ? identifier.value : null,
      passwordHash: user.passwordHash,
      recoveryCodeHash: user.recoveryCodeHash,
    });
    await this.repo(manager).insert(row);
    return row;
  }

  findById(id: string, manager?: EntityManager): Promise<User | null> {
    return this.repo(manager).findOneBy({ id });
  }

  findByIdentifier(identifier: Identifier, manager?: EntityManager): Promise<User | null> {
    return this.repo(manager).findOneBy(
      identifier.kind === 'phone' ? { phone: identifier.value } : { email: identifier.value },
    );
  }

  async updateCredentials(
    id: string,
    credentials: { passwordHash: string; recoveryCodeHash: string },
    manager?: EntityManager,
  ): Promise<void> {
    await this.repo(manager).update({ id }, credentials);
  }
}
