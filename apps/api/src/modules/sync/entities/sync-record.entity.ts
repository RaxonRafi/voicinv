import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

import { safeBigint } from '../../../database/transformers.js';

/**
 * The latest version of one synced record (customer, invoice, ledger entry, …) of a shop,
 * stored as the JSON document the device sent after validation against `src/shared`.
 */
@Entity({ name: 'sync_records' })
export class SyncRecord {
  @PrimaryColumn({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  /** Name of the synced table, as in `SYNC_TABLES` (e.g. `customers`, `ledgerEntries`). */
  @PrimaryColumn({ name: 'table_name', type: 'varchar', length: 32 })
  tableName: string;

  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'jsonb' })
  data: Record<string, unknown>;

  /** True when the record is soft-deleted (`data.deletedAt` is set). */
  @Column({ type: 'boolean', default: false })
  deleted: boolean;

  /** The registered device that pushed this version. */
  @Column({ name: 'device_id', type: 'uuid' })
  deviceId: string;

  /** Sequence number the record had when it first reached the server. */
  @Column({ name: 'created_seq', type: 'bigint', transformer: safeBigint })
  createdSeq: number;

  /** Sequence number of this version. Pulls return records with a higher number than the cursor. */
  @Column({ name: 'server_seq', type: 'bigint', transformer: safeBigint })
  serverSeq: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
