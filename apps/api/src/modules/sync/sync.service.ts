import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { AppException, type AuthContext, ErrorCode } from '../../common/index.js';
import {
  countSyncRecords,
  SYNC_PULL_PAGE_SIZE,
  SYNC_PUSH_MAX_RECORDS,
  SYNC_TABLE_NAMES,
  type Shop,
  type SyncChanges,
  type SyncPullResponse,
  type SyncPushRequest,
  type SyncPushResponse,
  type SyncTableName,
} from '../../shared/index.js';
import { DevicesService } from '../devices/index.js';
import { ShopsService } from '../shops/index.js';
import { findPushRejection, mentionedIds, planTable, type PushRejection } from './push-plan.js';
import { type SyncRecordWrite, SyncRepository } from './sync.repository.js';

/** `created`/`updated`/`deleted` lists of one table, before they are typed per table. */
interface TableChanges {
  created: unknown[];
  updated: unknown[];
  deleted: string[];
}

function isSyncTable(name: string): name is SyncTableName {
  return (SYNC_TABLE_NAMES as readonly string[]).includes(name);
}

/** Parses a cursor string. Sequence numbers stay far below 2^53, so a number is exact. */
function cursorToNumber(cursor: string): number {
  const value = Number(cursor);
  if (!Number.isSafeInteger(value)) {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_FAILED,
      'The sync cursor is out of range.',
    );
  }
  return value;
}

function rejection(problem: PushRejection): AppException {
  switch (problem.reason) {
    case 'FOREIGN_SHOP':
      return new AppException(
        HttpStatus.FORBIDDEN,
        ErrorCode.FORBIDDEN,
        'A record in this push belongs to another shop.',
        { table: problem.table, id: problem.id },
      );
    case 'APPEND_ONLY':
      return new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.APPEND_ONLY_VIOLATION,
        'Financial records can only be added, never changed or deleted.',
        { table: problem.table },
      );
    case 'SHOP_DELETE':
      return new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.BAD_REQUEST,
        'A shop cannot be deleted through sync.',
      );
  }
}

@Injectable()
export class SyncService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly repository: SyncRepository,
    private readonly devices: DevicesService,
    private readonly shops: ShopsService,
  ) {}

  /**
   * Applies a device's local changes in one transaction (AGENTS.md §8.5). Either everything
   * in the push is stored or nothing is. Re-sending the same push changes nothing.
   */
  async push(auth: AuthContext, request: SyncPushRequest): Promise<SyncPushResponse> {
    const { changes, deviceId } = request;
    if (countSyncRecords(changes) > SYNC_PUSH_MAX_RECORDS) {
      throw new AppException(
        HttpStatus.PAYLOAD_TOO_LARGE,
        ErrorCode.PAYLOAD_TOO_LARGE,
        `A push may contain at most ${SYNC_PUSH_MAX_RECORDS} records.`,
      );
    }
    const problem = findPushRejection(changes, auth.shopId);
    if (problem) throw rejection(problem);
    const lastPulledCursor = cursorToNumber(request.lastPulledCursor);

    return this.dataSource.transaction(async (manager) => {
      // The device must be registered to the caller's shop; its ID is not trusted otherwise.
      await this.devices.getForShop(auth.shopId, deviceId, manager);

      const seqBefore = await this.repository.lockCursor(auth.shopId, manager);
      const now = new Date();
      const writes: SyncRecordWrite[] = [];
      const conflicts: Record<string, TableChanges> = {};
      let seq = seqBefore;

      for (const table of SYNC_TABLE_NAMES) {
        const ids = mentionedIds(changes, table);
        if (ids.length === 0) continue;
        const plan = planTable({
          table,
          changes,
          stored: await this.repository.findByIds(auth.shopId, table, ids, manager),
          deviceId,
          lastPulledCursor,
          seq,
          now: now.getTime(),
        });
        seq = plan.seq;
        writes.push(...plan.writes);
        if (plan.conflicts.updated.length > 0 || plan.conflicts.deleted.length > 0) {
          conflicts[table] = { created: [], ...plan.conflicts };
        }
      }

      if (writes.length > 0) {
        await this.repository.write(auth.shopId, deviceId, writes, now, manager);
        await this.repository.saveCursor(auth.shopId, seq, manager);
        await this.mirrorShopProfile(auth.shopId, writes, manager);
      }
      await this.devices.markSynced(auth.shopId, deviceId, now, manager);

      // If nothing else reached the server since this device last pulled, it is now fully
      // up to date and may skip pulling its own changes back. Otherwise its cursor stays put.
      const upToDate = lastPulledCursor >= seqBefore;
      return {
        applied: writes.length,
        conflicts: conflicts as SyncChanges,
        cursor: String(upToDate ? seq : lastPulledCursor),
      };
    });
  }

  /** Changes of the caller's shop since `cursor`, one page at a time. */
  async pull(auth: AuthContext, cursorText: string): Promise<SyncPullResponse> {
    const cursor = cursorToNumber(cursorText);
    const rows = await this.repository.findSince(auth.shopId, cursor, SYNC_PULL_PAGE_SIZE + 1);
    const page = rows.slice(0, SYNC_PULL_PAGE_SIZE);

    const byTable: Record<string, TableChanges> = {};
    for (const row of page) {
      if (!isSyncTable(row.tableName)) continue;
      const entry = (byTable[row.tableName] ??= { created: [], updated: [], deleted: [] });
      (row.createdSeq > cursor ? entry.created : entry.updated).push(row.data);
      // Deleted records are sent in full (history still shows them) and listed by ID.
      if (row.deleted) entry.deleted.push(row.id);
    }
    // Tables in dependency order, parents before children, as clients apply them.
    const changes: Record<string, TableChanges> = {};
    for (const table of SYNC_TABLE_NAMES) {
      const entry = byTable[table];
      if (entry) changes[table] = entry;
    }

    return {
      changes: changes as SyncChanges,
      cursor: String(page.at(-1)?.serverSeq ?? cursor),
      hasMore: rows.length > page.length,
    };
  }

  /** Keeps the account's shop (shown by `GET /me`) in step with the synced shop profile. */
  private async mirrorShopProfile(
    shopId: string,
    writes: readonly SyncRecordWrite[],
    manager: Parameters<ShopsService['updateProfile']>[2],
  ): Promise<void> {
    const write = writes.findLast((candidate) => candidate.tableName === 'shops');
    if (!write) return;
    const shop = write.data as Shop;
    await this.shops.updateProfile(
      shopId,
      {
        name: shop.name,
        address: shop.address,
        phone: shop.phone,
        logo: shop.logo,
        currencyCode: shop.currencyCode,
        defaultLanguage: shop.defaultLanguage,
        invoicePrefix: shop.invoicePrefix,
      },
      manager,
    );
  }
}
