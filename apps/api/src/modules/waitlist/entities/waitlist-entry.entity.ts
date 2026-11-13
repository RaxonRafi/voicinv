import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'waitlist_entries' })
export class WaitlistEntry {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_waitlist_entries' })
  id: string;

  @Column({ type: 'varchar', length: 254, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  name: string | null;

  @Column({ type: 'varchar', length: 5 })
  locale: string;

  @Column({ name: 'shop_type', type: 'varchar', length: 60, nullable: true })
  shopType: string | null;

  @Column({ type: 'varchar', length: 40, default: 'landing' })
  source: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
