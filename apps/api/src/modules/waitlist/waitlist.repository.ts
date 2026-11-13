import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WaitlistEntry } from './entities/waitlist-entry.entity.js';

export interface NewWaitlistEntry {
  email: string | null;
  phone: string | null;
  name: string | null;
  locale: string;
  shopType: string | null;
  source: string;
}

/** All TypeORM access for the waitlist module. */
@Injectable()
export class WaitlistRepository {
  constructor(
    @InjectRepository(WaitlistEntry)
    private readonly entries: Repository<WaitlistEntry>,
  ) {}

  /**
   * Inserts the signup unless its email or phone is already on the list.
   * Returns true when a new row was created. A single atomic statement, so concurrent
   * duplicate submissions cannot both succeed or raise.
   */
  async insertIfNew(entry: NewWaitlistEntry): Promise<boolean> {
    const result = await this.entries
      .createQueryBuilder()
      .insert()
      .values(entry)
      .orIgnore()
      .returning('id')
      .execute();
    const rows: unknown = result.raw;
    return Array.isArray(rows) && rows.length > 0;
  }
}
