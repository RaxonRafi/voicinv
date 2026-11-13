import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** The shop an account owns. Its `id` is generated on the device before any account exists. */
@Entity({ name: 'shops' })
export class Shop {
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_shops' })
  id: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  /** Logo as a data URI. */
  @Column({ type: 'text', nullable: true })
  logo: string | null;

  @Column({ name: 'currency_code', type: 'varchar', length: 3 })
  currencyCode: string;

  @Column({ name: 'default_language', type: 'varchar', length: 5 })
  defaultLanguage: string;

  @Column({ name: 'invoice_prefix', type: 'varchar', length: 6 })
  invoicePrefix: string;

  /** The next device number to hand out; 1 becomes device code "A". */
  @Column({ name: 'device_sequence', type: 'integer', default: 1 })
  deviceSequence: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
