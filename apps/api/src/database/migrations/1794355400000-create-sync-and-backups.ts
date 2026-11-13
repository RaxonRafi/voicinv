import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Multi-device sync and encrypted cloud backups (M12).
 *
 * Synced records are stored as validated JSON documents, one row per record, keyed by shop.
 * Their shape is defined once, by the Zod schemas in `src/shared`, which the mobile app and
 * the API both validate against.
 */
export class CreateSyncAndBackups1794355400000 implements MigrationInterface {
  name = 'CreateSyncAndBackups1794355400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // One row per shop: the last sequence number handed out. A push locks this row, so the
    // sequence numbers of a shop are assigned in commit order and a pull can never skip one.
    await queryRunner.query(`
      CREATE TABLE "sync_cursors" (
        "shop_id" uuid NOT NULL,
        "last_seq" bigint NOT NULL DEFAULT 0,
        CONSTRAINT "pk_sync_cursors" PRIMARY KEY ("shop_id"),
        CONSTRAINT "fk_sync_cursors_shop" FOREIGN KEY ("shop_id") REFERENCES "shops" ("id")
          ON DELETE CASCADE
      )
    `);

    // "server_seq" is the sequence number of the stored version; "created_seq" the one the
    // record had when it first arrived. "device_id" is the device that pushed this version.
    await queryRunner.query(`
      CREATE TABLE "sync_records" (
        "shop_id" uuid NOT NULL,
        "table_name" varchar(32) NOT NULL,
        "id" uuid NOT NULL,
        "data" jsonb NOT NULL,
        "deleted" boolean NOT NULL DEFAULT false,
        "device_id" uuid NOT NULL,
        "created_seq" bigint NOT NULL,
        "server_seq" bigint NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_sync_records" PRIMARY KEY ("shop_id", "table_name", "id"),
        CONSTRAINT "uq_sync_records_seq" UNIQUE ("shop_id", "server_seq"),
        CONSTRAINT "fk_sync_records_shop" FOREIGN KEY ("shop_id") REFERENCES "shops" ("id")
          ON DELETE CASCADE
      )
    `);

    // Financial records are append-only (AGENTS.md §1 rule 8). The service never updates
    // them; this trigger makes sure nothing else can either.
    await queryRunner.query(`
      CREATE FUNCTION "sync_records_reject_append_only_update"() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'append-only record %.% cannot be updated', OLD.table_name, OLD.id
          USING ERRCODE = 'restrict_violation';
      END
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_sync_records_append_only"
      BEFORE UPDATE ON "sync_records"
      FOR EACH ROW
      WHEN (OLD.table_name IN ('payments', 'ledgerEntries', 'invoiceRevisions'))
      EXECUTE FUNCTION "sync_records_reject_append_only_update"()
    `);

    // Metadata of client-encrypted backups. The encrypted file itself lives in backup storage.
    await queryRunner.query(`
      CREATE TABLE "backups" (
        "id" uuid NOT NULL,
        "shop_id" uuid NOT NULL,
        "device_id" uuid,
        "size_bytes" bigint NOT NULL,
        "checksum" char(64) NOT NULL,
        "format_version" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_backups" PRIMARY KEY ("id"),
        CONSTRAINT "chk_backups_size" CHECK ("size_bytes" > 0),
        CONSTRAINT "fk_backups_shop" FOREIGN KEY ("shop_id") REFERENCES "shops" ("id")
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_backups_shop_created" ON "backups" ("shop_id", "created_at" DESC)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "backups"`);
    await queryRunner.query(`DROP TABLE "sync_records"`);
    await queryRunner.query(`DROP FUNCTION "sync_records_reject_append_only_update"()`);
    await queryRunner.query(`DROP TABLE "sync_cursors"`);
  }
}
