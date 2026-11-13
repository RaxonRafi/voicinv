import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Landing-page waitlist signups (server-only table, not part of device sync).
 * A signup carries an email, a phone number, or both; each may appear only once.
 */
export class CreateWaitlistEntries1794355200000 implements MigrationInterface {
  name = 'CreateWaitlistEntries1794355200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "waitlist_entries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" varchar(254),
        "phone" varchar(20),
        "name" varchar(120),
        "locale" varchar(5) NOT NULL,
        "shop_type" varchar(60),
        "source" varchar(40) NOT NULL DEFAULT 'landing',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_waitlist_entries" PRIMARY KEY ("id"),
        CONSTRAINT "uq_waitlist_entries_email" UNIQUE ("email"),
        CONSTRAINT "uq_waitlist_entries_phone" UNIQUE ("phone"),
        CONSTRAINT "chk_waitlist_entries_contact"
          CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "waitlist_entries"`);
  }
}
