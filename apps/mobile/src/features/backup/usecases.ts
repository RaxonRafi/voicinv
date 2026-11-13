import { type Database, type Orm } from '@/core/db';
import { shareFile, writeCacheFile } from '@/core/platform';

import { createBackupEnvelope, parseBackupEnvelope } from './crypto';
import { exportDatabaseDump, restoreDatabaseDump } from './repository';
import { type BackupPayload, type EncryptedBackupEnvelope } from './types';

export async function createBackupFile(
  orm: Orm,
  shopId: string,
  deviceId: string,
  now = Date.now(),
): Promise<{ envelope: EncryptedBackupEnvelope; uri: string }> {
  const dump = await exportDatabaseDump(orm, shopId, deviceId, now);
  const envelope = await createBackupEnvelope(dump);
  const content = JSON.stringify(envelope, null, 2);
  const fileName = `voiceledger_${shopId}_${now}.vlbackup`;
  const uri = await writeCacheFile(fileName, content);

  return { envelope, uri };
}

export async function exportAndShareBackup(
  orm: Orm,
  shopId: string,
  deviceId: string,
  title = 'VoiceLedger Backup',
  now = Date.now(),
): Promise<string> {
  const { uri } = await createBackupFile(orm, shopId, deviceId, now);
  await shareFile(uri, 'application/json', title);
  return uri;
}

export async function restoreFromBackupString(
  db: Database,
  backupContent: string,
): Promise<BackupPayload> {
  const payload = await parseBackupEnvelope(backupContent);
  await db.write(async (tx) => {
    await restoreDatabaseDump(tx, payload);
  });
  return payload;
}
