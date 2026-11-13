import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** An optional account. Identified by a phone number or an email address, never both. */
@Entity({ name: 'users' })
export class User {
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_users' })
  id: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 254, nullable: true })
  email: string | null;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ name: 'recovery_code_hash', type: 'varchar', length: 255 })
  recoveryCodeHash: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
