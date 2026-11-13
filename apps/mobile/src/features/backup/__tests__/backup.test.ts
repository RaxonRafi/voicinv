import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'crypto';

import { customers, products, shops } from '@/core/db';
import { writeCacheBytes } from '@/core/platform';
import { createTestShopApp, type TestShopApp } from '@/core/testing/harness';
import { BACKUP_MIN_KDF_ITERATIONS, isEncryptedBackup } from '@/shared';

import { decodeUtf8, decryptBackup, encodeUtf8, encryptBackup } from '../crypto';
import { hmacSha256, pbkdf2Sha256, sha256 } from '../pbkdf2';
import { clearAllTables, exportDatabaseDump } from '../repository';
import { BackupError } from '../types';
import { createBackupFile, parseBackupPayload, restoreFromBackupFile } from '../usecases';

// Real backups use BACKUP_KDF_ITERATIONS; tests use the smallest count the format allows.
const FAST = { iterations: BACKUP_MIN_KDF_ITERATIONS };
const PASSWORD = 'correct horse battery';

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

async function expectBackupError(promise: Promise<unknown>, code: BackupError['code']) {
  await expect(promise).rejects.toMatchObject({ name: 'BackupError', code });
}

describe('pbkdf2', () => {
  it('computes SHA-256 and HMAC-SHA-256 like Node for lengths around block edges', () => {
    for (const length of [0, 1, 31, 55, 56, 63, 64, 65, 119, 120, 200, 1000]) {
      const data = randomBytes(length);
      const key = randomBytes(length % 130);
      expect(hex(sha256(data))).toBe(createHash('sha256').update(data).digest('hex'));
      expect(hex(hmacSha256(key, data))).toBe(createHmac('sha256', key).update(data).digest('hex'));
    }
  });

  it('matches the RFC 7914 PBKDF2-HMAC-SHA-256 test vectors', () => {
    const passwd = pbkdf2Sha256(encodeUtf8('passwd'), encodeUtf8('salt'), 1);
    expect(hex(passwd)).toBe('55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc');
    const nacl = pbkdf2Sha256(encodeUtf8('Password'), encodeUtf8('NaCl'), 80_000);
    expect(hex(nacl)).toBe('4ddcd8f60b98be21830cee5ef22701f9641a4418d04c0414aeff08876b34ab56');
  });

  it('matches Node for random passwords (including ones longer than a block) and salts', () => {
    for (const passwordLength of [1, 8, 64, 65, 150]) {
      const password = randomBytes(passwordLength);
      const salt = randomBytes(16);
      expect(hex(pbkdf2Sha256(password, salt, 1000))).toBe(
        pbkdf2Sync(password, salt, 1000, 32, 'sha256').toString('hex'),
      );
    }
  });

  it('refuses a non-positive iteration count', () => {
    expect(() => pbkdf2Sha256(encodeUtf8('x'), encodeUtf8('y'), 0)).toThrow(RangeError);
  });
});

describe('utf-8', () => {
  it('round-trips Bengali, English and emoji text', () => {
    const text = 'করিম Karim ৳২৫০০ 🧾 আড়াই';
    expect(decodeUtf8(encodeUtf8(text))).toBe(text);
  });

  it('refuses malformed input instead of guessing', () => {
    for (const bad of [[0xff], [0xc3], [0xe0, 0x80, 0x80], [0xed, 0xa0, 0x80], [0x80]]) {
      expect(() => decodeUtf8(Uint8Array.from(bad))).toThrow(BackupError);
    }
  });
});

describe('backup encryption', () => {
  const plaintext = encodeUtf8('{"customer":"Karim Uddin","due":250000}');

  it('produces a container the server accepts and that does not contain the plaintext', async () => {
    const file = await encryptBackup(plaintext, PASSWORD, FAST);

    expect(isEncryptedBackup(file)).toBe(true);
    expect(Buffer.from(file).includes(Buffer.from('Karim'))).toBe(false);
    expect(await decryptBackup(file, PASSWORD)).toEqual(plaintext);
  });

  it('uses a fresh salt and nonce for every backup', async () => {
    const first = await encryptBackup(plaintext, PASSWORD, FAST);
    const second = await encryptBackup(plaintext, PASSWORD, FAST);
    expect(hex(first)).not.toBe(hex(second));
  });

  it('refuses a wrong password', async () => {
    const file = await encryptBackup(plaintext, PASSWORD, FAST);
    await expectBackupError(decryptBackup(file, 'wrong password'), 'WRONG_PASSWORD');
  });

  it('detects any change to the header or the ciphertext', async () => {
    const file = await encryptBackup(plaintext, PASSWORD, FAST);
    for (const offset of [12, 30, file.length - 20, file.length - 1]) {
      const altered = file.slice();
      altered[offset] = (altered[offset] ?? 0) ^ 0x01;
      await expectBackupError(decryptBackup(altered, PASSWORD), 'WRONG_PASSWORD');
    }
  });

  it('recognises files that are not backups at all', async () => {
    await expectBackupError(decryptBackup(encodeUtf8('{"magic":"x"}'), PASSWORD), 'NOT_A_BACKUP');
  });

  it('refuses passwords that are too short', async () => {
    await expectBackupError(encryptBackup(plaintext, 'short', FAST), 'PASSWORD_TOO_SHORT');
  });
});

describe('backup feature', () => {
  let app: TestShopApp;
  const now = Date.UTC(2026, 10, 12, 10, 0, 0);

  beforeEach(async () => {
    app = await createTestShopApp();
    await app.ctx.db.write(async (tx) => {
      const common = {
        shopId: app.shopId,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        deviceId: app.ctx.deviceId,
        isDirty: true,
      };
      await tx.orm.insert(customers).values({
        ...common,
        id: app.ctx.newId(),
        name: 'Karim Uddin',
        phone: '01712345678',
        notes: 'Regular buyer',
        creditLimit: 500000,
      });
      await tx.orm.insert(products).values({
        ...common,
        id: app.ctx.newId(),
        name: 'Mustard Oil',
        unit: 'liter',
        defaultPrice: 22000,
        stockQty: 50,
      });
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('exports a database dump containing all seeded tables', async () => {
    const dump = await exportDatabaseDump(app.ctx.db.orm, app.shopId, app.ctx.deviceId, now);

    expect(dump.version).toBe(1);
    expect(dump.shopId).toBe(app.shopId);
    expect(dump.tables.shops).toHaveLength(1);
    expect(dump.tables.customers[0]?.name).toBe('Karim Uddin');
    expect(dump.tables.products[0]?.name).toBe('Mustard Oil');
  });

  it('writes an encrypted .vlbk file', async () => {
    const { bytes, uri } = await createBackupFile(
      app.ctx.db.orm,
      app.shopId,
      app.ctx.deviceId,
      PASSWORD,
      now,
      FAST,
    );

    expect(uri).toMatch(/\.vlbk$/);
    expect(isEncryptedBackup(bytes)).toBe(true);
    expect(Buffer.from(bytes).includes(Buffer.from('Karim'))).toBe(false);
    expect(writeCacheBytes).toHaveBeenCalledWith(expect.stringMatching(/\.vlbk$/), bytes);
  });

  it('full round trip: export → wipe → restore yields identical data', async () => {
    const dump = await exportDatabaseDump(app.ctx.db.orm, app.shopId, app.ctx.deviceId, now);
    const { bytes } = await createBackupFile(
      app.ctx.db.orm,
      app.shopId,
      app.ctx.deviceId,
      PASSWORD,
      now,
      FAST,
    );

    await app.ctx.db.write((tx) => clearAllTables(tx));
    expect(await app.ctx.db.orm.select().from(customers)).toHaveLength(0);

    await restoreFromBackupFile(app.ctx.db, bytes, PASSWORD);

    expect(await app.ctx.db.orm.select().from(shops)).toEqual(dump.tables.shops);
    expect(await app.ctx.db.orm.select().from(customers)).toEqual(dump.tables.customers);
    expect(await app.ctx.db.orm.select().from(products)).toEqual(dump.tables.products);
  });

  it('leaves the current records untouched when the password is wrong', async () => {
    const { bytes } = await createBackupFile(
      app.ctx.db.orm,
      app.shopId,
      app.ctx.deviceId,
      PASSWORD,
      now,
      FAST,
    );

    await expectBackupError(
      restoreFromBackupFile(app.ctx.db, bytes, 'not the password'),
      'WRONG_PASSWORD',
    );
    expect(await app.ctx.db.orm.select().from(customers)).toHaveLength(1);
  });

  describe('parseBackupPayload', () => {
    async function dumpJson(change: (payload: Record<string, unknown>) => void = () => undefined) {
      const dump = await exportDatabaseDump(app.ctx.db.orm, app.shopId, app.ctx.deviceId, now);
      const payload = JSON.parse(JSON.stringify(dump)) as Record<string, unknown>;
      change(payload);
      return JSON.stringify(payload);
    }
    const tablesOf = (payload: Record<string, unknown>) =>
      payload.tables as Record<string, Record<string, unknown>[]>;

    it('accepts a dump of the local database', async () => {
      expect(parseBackupPayload(await dumpJson()).shopId).toBe(app.shopId);
    });

    it('refuses records that belong to another shop', async () => {
      const json = await dumpJson((payload) => {
        const [customer] = tablesOf(payload).customers ?? [];
        if (customer) customer.shopId = '0192f0c0-0000-7000-8000-00000000beef';
      });
      expect(() => parseBackupPayload(json)).toThrow(BackupError);
    });

    it('refuses a backup with more than one shop or a missing table', async () => {
      const twoShops = await dumpJson((payload) => {
        const tables = tablesOf(payload);
        tables.shops = [...(tables.shops ?? []), ...(tables.shops ?? [])];
      });
      const missingTable = await dumpJson((payload) => {
        delete tablesOf(payload).ledgerEntries;
      });
      expect(() => parseBackupPayload(twoShops)).toThrow(BackupError);
      expect(() => parseBackupPayload(missingTable)).toThrow(BackupError);
      expect(() => parseBackupPayload('not json')).toThrow(BackupError);
    });
  });
});
