import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';

import { BACKUP_KDF_ITERATIONS, encodeBackupHeader } from '../src/shared/index.js';
import { createAccount, type TestAccount } from './support/accounts.js';
import { createTestApp, nextClientIp, type TestApp } from './support/test-app.js';

// Client-encrypted cloud backups against real Postgres and real file storage (AGENTS.md §1
// rule 9, §14): only encrypted containers are accepted, files come back byte for byte, and no
// shop can see another shop's backups.

/** Something shaped like a real encrypted backup: a valid header and opaque ciphertext. */
function encryptedBackup(size = 2048): Buffer {
  const header = encodeBackupHeader({
    iterations: BACKUP_KDF_ITERATIONS,
    salt: randomBytes(16),
    nonce: randomBytes(12),
  });
  return Buffer.concat([header, randomBytes(size)]);
}

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

describe('backups (e2e)', () => {
  let testApp: TestApp;
  let storage: string;

  beforeAll(async () => {
    storage = mkdtempSync(join(tmpdir(), 'voiceledger-backups-'));
    process.env.BACKUP_STORAGE_DIR = storage;
    process.env.BACKUPS_TO_KEEP = '3';
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
    rmSync(storage, { recursive: true, force: true });
    delete process.env.BACKUP_STORAGE_DIR;
    delete process.env.BACKUPS_TO_KEEP;
  });

  function upload(account: TestAccount, bytes: Buffer, checksum = sha256(bytes)) {
    return request(testApp.server)
      .post(`/api/v1/backups?checksum=${checksum}`)
      .set('X-Forwarded-For', nextClientIp())
      .set('Authorization', `Bearer ${account.accessToken}`)
      .set('Content-Type', 'application/octet-stream')
      .send(bytes);
  }

  function get(account: TestAccount, path: string) {
    return request(testApp.server)
      .get(`/api/v1${path}`)
      .set('X-Forwarded-For', nextClientIp())
      .set('Authorization', `Bearer ${account.accessToken}`)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => done(null, Buffer.concat(chunks)));
      });
  }

  it('stores an encrypted backup and returns it byte for byte', async () => {
    const account = await createAccount(testApp);
    const bytes = encryptedBackup();

    const stored = await upload(account, bytes);
    const list = await get(account, '/backups');
    const download = await get(account, `/backups/${stored.body.data.id}`);

    expect(stored.status).toBe(201);
    expect(stored.body.data).toMatchObject({
      sizeBytes: bytes.length,
      checksum: sha256(bytes),
      formatVersion: 1,
    });
    expect(JSON.parse((list.body as Buffer).toString()).data).toHaveLength(1);
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toBe('application/octet-stream');
    expect(Buffer.compare(download.body as Buffer, bytes)).toBe(0);
  });

  it('refuses plaintext, so unencrypted shop data is never stored', async () => {
    const account = await createAccount(testApp);
    const plaintext = Buffer.from(JSON.stringify({ customers: [{ name: 'Karim' }] }));

    const response = await upload(account, plaintext);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_BACKUP');
  });

  it('refuses an upload that was damaged on the way', async () => {
    const account = await createAccount(testApp);
    const bytes = encryptedBackup();

    const response = await upload(account, bytes, sha256(Buffer.from('something else')));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_BACKUP');
  });

  it('keeps only the newest backups of a shop', async () => {
    const account = await createAccount(testApp);
    const ids: string[] = [];
    for (let n = 0; n < 5; n += 1) {
      ids.push((await upload(account, encryptedBackup())).body.data.id as string);
    }

    const list = JSON.parse((await get(account, '/backups')).body.toString()).data as {
      id: string;
    }[];

    expect(list.map((backup) => backup.id)).toEqual(ids.slice(-3).reverse());
    expect((await get(account, `/backups/${ids[0] ?? ''}`)).status).toBe(404);
  });

  it('never shows or hands out another shop’s backups', async () => {
    const owner = await createAccount(testApp);
    const stranger = await createAccount(testApp);
    const stored = await upload(owner, encryptedBackup());

    const list = JSON.parse((await get(stranger, '/backups')).body.toString()).data;
    const download = await get(stranger, `/backups/${stored.body.data.id}`);

    expect(list).toEqual([]);
    expect(download.status).toBe(404);
  });
});
