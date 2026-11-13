import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

import { safeBigint } from '../../../database/transformers.js';

/** Metadata of one client-encrypted backup. The encrypted file lives in backup storage. */
@Entity({ name: 'backups' })
export class Backup {
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_backups' })
  id: string;

  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  /** The device that made the backup, when it said so. */
  @Column({ name: 'device_id', type: 'uuid', nullable: true })
  deviceId: string | null;

  @Column({ name: 'size_bytes', type: 'bigint', transformer: safeBigint })
  sizeBytes: number;

  /** SHA-256 of the encrypted file, hex encoded. */
  @Column({ type: 'char', length: 64 })
  checksum: string;

  @Column({ name: 'format_version', type: 'integer' })
  formatVersion: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
