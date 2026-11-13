import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, In, MoreThan, Repository } from 'typeorm';

import { SyncCursor } from './entities/sync-cursor.entity.js';
import { SyncRecord } from './entities/sync-record.entity.js';

/** A record version to store: a new record, or a changed version of an existing one. */
export interface SyncRecordWrite {
  tableName: string;
  id: string;
  data: Record<string, unknown>;
  deleted: boolean;
  /** Sequence number of this version. For a new record it is also its `created_seq`. */
  serverSeq: number;
}

/** Rows per INSERT statement: 9 parameters each, far below Postgres' 65 535 limit. */
const WRITE_CHUNK = 500;

/**
 * All TypeORM access for the sync module. Every query is keyed by shop, so a record ID from
 * another tenant can never match.
 */
@Injectable()
export class SyncRepository {
  constructor(
    @InjectRepository(SyncRecord) private readonly records: Repository<SyncRecord>,
    @InjectRepository(SyncCursor) private readonly cursors: Repository<SyncCursor>,
  ) {}

  /**
   * Locks the shop's sequence row until the transaction ends and returns the last number
   * handed out. Pushes of one shop therefore run one after another, and sequence numbers are
   * committed in order: a pull never sees number N+1 while N is still uncommitted.
   */
  async lockCursor(shopId: string, manager: EntityManager): Promise<number> {
    const cursors = manager.getRepository(SyncCursor);
    await cursors.createQueryBuilder().insert().values({ shopId, lastSeq: 0 }).orIgnore().execute();
    const cursor = await cursors.findOneOrFail({
      where: { shopId },
      lock: { mode: 'pessimistic_write' },
    });
    return cursor.lastSeq;
  }

  async saveCursor(shopId: string, lastSeq: number, manager: EntityManager): Promise<void> {
    await manager.getRepository(SyncCursor).update({ shopId }, { lastSeq });
  }

  /** The stored versions of the given records of one table, by record ID. */
  async findByIds(
    shopId: string,
    tableName: string,
    ids: readonly string[],
    manager: EntityManager,
  ): Promise<Map<string, SyncRecord>> {
    if (ids.length === 0) return new Map();
    const rows = await manager
      .getRepository(SyncRecord)
      .findBy({ shopId, tableName, id: In([...ids]) });
    return new Map(rows.map((row) => [row.id, row]));
  }

  /**
   * Stores new records and new versions of existing ones. An existing row keeps its
   * `created_seq` and `created_at`; everything else is replaced.
   */
  async write(
    shopId: string,
    deviceId: string,
    writes: readonly SyncRecordWrite[],
    at: Date,
    manager: EntityManager,
  ): Promise<void> {
    for (let start = 0; start < writes.length; start += WRITE_CHUNK) {
      const chunk = writes.slice(start, start + WRITE_CHUNK);
      await manager
        .getRepository(SyncRecord)
        .createQueryBuilder()
        .insert()
        .values(
          chunk.map((write) => ({
            shopId,
            deviceId,
            tableName: write.tableName,
            id: write.id,
            data: write.data,
            deleted: write.deleted,
            createdSeq: write.serverSeq,
            serverSeq: write.serverSeq,
            updatedAt: at,
          })),
        )
        .orUpdate(
          ['data', 'deleted', 'device_id', 'server_seq', 'updated_at'],
          ['shop_id', 'table_name', 'id'],
        )
        .execute();
    }
  }

  /** Up to `limit` records of the shop changed after `cursor`, oldest change first. */
  findSince(shopId: string, cursor: number, limit: number): Promise<SyncRecord[]> {
    return this.records.find({
      where: { shopId, serverSeq: MoreThan(cursor) },
      order: { serverSeq: 'ASC' },
      take: limit,
    });
  }

  /** The shop's last committed sequence number (0 before its first push). */
  async lastSeq(shopId: string): Promise<number> {
    const cursor = await this.cursors.findOneBy({ shopId });
    return cursor?.lastSeq ?? 0;
  }
}
