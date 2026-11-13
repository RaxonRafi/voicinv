import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * A phone or tablet registered to a shop. Its `deviceCode` (A, B, …) is part of every invoice
 * number the device creates, so devices working offline never produce the same number.
 */
@Entity({ name: 'devices' })
export class Device {
  @PrimaryColumn({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  /** Generated on the device at first launch. */
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ name: 'device_code', type: 'varchar', length: 3 })
  deviceCode: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  platform: string;

  @Column({ name: 'last_sync_at', type: 'timestamptz', nullable: true })
  lastSyncAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
