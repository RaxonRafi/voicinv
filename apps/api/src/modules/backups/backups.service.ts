import { createHash } from 'node:crypto';
import { type ReadStream } from 'node:fs';

import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AppException, type AuthContext, ErrorCode } from '../../common/index.js';
import { type Env } from '../../config/index.js';
import {
  type BackupMetadata,
  type BackupUploadQuery,
  createUuidV7Generator,
  decodeBackupHeader,
} from '../../shared/index.js';
import { DevicesService } from '../devices/index.js';
import { BackupStorage } from './backup-storage.js';
import { BackupsRepository } from './backups.repository.js';
import { type Backup } from './entities/backup.entity.js';

const newBackupId = createUuidV7Generator();

export function toBackupMetadata(backup: Backup): BackupMetadata {
  return {
    id: backup.id,
    createdAt: backup.createdAt.getTime(),
    sizeBytes: backup.sizeBytes,
    checksum: backup.checksum,
    deviceId: backup.deviceId,
    formatVersion: backup.formatVersion,
  };
}

function invalidBackup(message: string): AppException {
  return new AppException(HttpStatus.BAD_REQUEST, ErrorCode.INVALID_BACKUP, message);
}

@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly repository: BackupsRepository,
    private readonly storage: BackupStorage,
    private readonly devices: DevicesService,
  ) {}

  /**
   * Stores a backup that was encrypted on the device (AGENTS.md §1 rule 9). The server cannot
   * read it; it only makes sure the upload is an encrypted backup container and arrived
   * intact, then keeps the newest `BACKUPS_TO_KEEP` backups of the shop.
   */
  async upload(
    auth: AuthContext,
    query: BackupUploadQuery,
    body: unknown,
  ): Promise<BackupMetadata> {
    if (!(body instanceof Uint8Array) || body.length === 0) {
      throw invalidBackup('Send the encrypted backup as application/octet-stream.');
    }
    const header = decodeBackupHeader(body);
    if (!header) {
      // Refusing anything else guarantees plaintext shop data is never stored by mistake.
      throw invalidBackup('This file is not an encrypted VoiceLedger backup.');
    }
    if (createHash('sha256').update(body).digest('hex') !== query.checksum) {
      throw invalidBackup('The backup was damaged while uploading. Try again.');
    }
    if (query.deviceId) await this.devices.getForShop(auth.shopId, query.deviceId);

    const id = newBackupId();
    await this.storage.write(auth.shopId, id, body);
    let backup: Backup;
    try {
      backup = await this.repository.insert({
        id,
        shopId: auth.shopId,
        deviceId: query.deviceId ?? null,
        sizeBytes: body.length,
        checksum: query.checksum,
        formatVersion: header.formatVersion,
      });
    } catch (error) {
      await this.storage.remove(auth.shopId, id);
      throw error;
    }

    await this.prune(auth.shopId);
    this.logger.log('Encrypted backup stored.');
    return toBackupMetadata(backup);
  }

  /** The shop's backups, newest first. */
  async list(auth: AuthContext): Promise<BackupMetadata[]> {
    return (await this.repository.list(auth.shopId)).map(toBackupMetadata);
  }

  /** The encrypted file of one of the shop's own backups. */
  async download(
    auth: AuthContext,
    id: string,
  ): Promise<{ metadata: BackupMetadata; stream: ReadStream }> {
    const backup = await this.repository.find(auth.shopId, id);
    const stream = backup ? await this.storage.open(auth.shopId, backup.id) : null;
    if (!backup || !stream) {
      throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Backup not found.');
    }
    return { metadata: toBackupMetadata(backup), stream };
  }

  /** Removes the shop's oldest backups beyond the configured number to keep. */
  private async prune(shopId: string): Promise<void> {
    const keep = this.config.get('BACKUPS_TO_KEEP', { infer: true });
    const surplus = (await this.repository.list(shopId)).slice(keep);
    for (const backup of surplus) {
      await this.repository.remove(shopId, backup.id);
      await this.storage.remove(shopId, backup.id);
    }
  }
}
