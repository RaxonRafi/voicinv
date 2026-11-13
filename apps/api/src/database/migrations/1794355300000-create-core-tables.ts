import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Optional accounts (M11): users, the shop each user owns, the devices registered to a shop
 * and refresh tokens. All server-side tables; the app's core loop never needs them.
 */
export class CreateCoreTables1794355300000 implements MigrationInterface {
  name = 'CreateCoreTables1794355300000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // An account is identified by a phone number or an email address (exactly one is set).
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL,
        "phone" varchar(20),
        "email" varchar(254),
        "password_hash" varchar(255) NOT NULL,
        "recovery_code_hash" varchar(255) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_users" PRIMARY KEY ("id"),
        CONSTRAINT "uq_users_phone" UNIQUE ("phone"),
        CONSTRAINT "uq_users_email" UNIQUE ("email"),
        CONSTRAINT "chk_users_identifier" CHECK (("phone" IS NULL) <> ("email" IS NULL))
      )
    `);

    // "id" is generated on the device, so the shop keeps its identity when an account is
    // created. "device_sequence" is the next device number to hand out (1 = code "A").
    await queryRunner.query(`
      CREATE TABLE "shops" (
        "id" uuid NOT NULL,
        "owner_id" uuid NOT NULL,
        "name" varchar(120) NOT NULL,
        "address" varchar(300),
        "phone" varchar(20),
        "logo" text,
        "currency_code" varchar(3) NOT NULL,
        "default_language" varchar(5) NOT NULL,
        "invoice_prefix" varchar(6) NOT NULL,
        "device_sequence" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_shops" PRIMARY KEY ("id"),
        CONSTRAINT "fk_shops_owner" FOREIGN KEY ("owner_id") REFERENCES "users" ("id")
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_shops_owner" ON "shops" ("owner_id")`);

    // Device IDs are generated on the device. The key includes the shop, so one tenant can
    // never collide with, or claim, a device row of another.
    await queryRunner.query(`
      CREATE TABLE "devices" (
        "shop_id" uuid NOT NULL,
        "id" uuid NOT NULL,
        "device_code" varchar(3) NOT NULL,
        "name" varchar(80) NOT NULL,
        "platform" varchar(20) NOT NULL,
        "last_sync_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_devices" PRIMARY KEY ("shop_id", "id"),
        CONSTRAINT "uq_devices_shop_code" UNIQUE ("shop_id", "device_code"),
        CONSTRAINT "fk_devices_shop" FOREIGN KEY ("shop_id") REFERENCES "shops" ("id")
          ON DELETE CASCADE
      )
    `);

    // Only a keyed hash of each refresh token is stored. "rotated_at" is set when the token
    // has been exchanged for a new one; "revoked_at" when it was signed out or invalidated.
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "token_hash" varchar(64) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "rotated_at" timestamptz,
        "revoked_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "uq_refresh_tokens_hash" UNIQUE ("token_hash"),
        CONSTRAINT "fk_refresh_tokens_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id")
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_tokens_user" ON "refresh_tokens" ("user_id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE "devices"`);
    await queryRunner.query(`DROP TABLE "shops"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
