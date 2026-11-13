import { Column, Entity, PrimaryColumn } from 'typeorm';

import { safeBigint } from '../../../database/transformers.js';

/** The last sync sequence number handed out for a shop. Locked for the duration of a push. */
@Entity({ name: 'sync_cursors' })
export class SyncCursor {
  @PrimaryColumn({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @Column({ name: 'last_seq', type: 'bigint', default: 0, transformer: safeBigint })
  lastSeq: number;
}
