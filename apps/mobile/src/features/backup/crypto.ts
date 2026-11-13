import * as Crypto from 'expo-crypto';

import { type BackupPayload, type EncryptedBackupEnvelope } from './types';

export async function createBackupEnvelope(
  payload: BackupPayload,
): Promise<EncryptedBackupEnvelope> {
  const serialized = JSON.stringify(payload);
  const checksum = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, serialized);

  return {
    magic: 'VOICELEDGER_BACKUP',
    version: 1,
    createdAt: payload.exportedAt,
    shopId: payload.shopId,
    checksum,
    data: Buffer.from(serialized, 'utf-8').toString('base64'),
  };
}

export async function parseBackupEnvelope(envelopeString: string): Promise<BackupPayload> {
  let envelope: EncryptedBackupEnvelope;
  try {
    envelope = JSON.parse(envelopeString) as EncryptedBackupEnvelope;
  } catch {
    throw new Error('Invalid backup file content');
  }

  if (envelope.magic !== 'VOICELEDGER_BACKUP' || envelope.version !== 1) {
    throw new Error('Invalid VoiceLedger backup file format');
  }

  const rawJson = Buffer.from(envelope.data, 'base64').toString('utf-8');
  const checksum = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawJson);

  if (checksum !== envelope.checksum) {
    throw new Error('Backup checksum mismatch: corrupted file');
  }

  let payload: BackupPayload;
  try {
    payload = JSON.parse(rawJson) as BackupPayload;
  } catch {
    throw new Error('Corrupted backup payload JSON');
  }

  if (payload.version !== 1 || !payload.tables) {
    throw new Error('Invalid backup payload');
  }

  return payload;
}
