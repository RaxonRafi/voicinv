import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type Env } from '../../config/index.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where encrypted backup files live: `<BACKUP_STORAGE_DIR>/<shop id>/<backup id>.vlbk`.
 * The files are opaque to the server; it never has the key to read them.
 */
@Injectable()
export class BackupStorage {
  private readonly root: string;

  constructor(config: ConfigService<Env, true>) {
    this.root = resolve(config.get('BACKUP_STORAGE_DIR', { infer: true }));
  }

  /** Both IDs become part of a path, so anything that is not a UUID is refused. */
  private path(shopId: string, backupId: string): string {
    if (!UUID.test(shopId) || !UUID.test(backupId)) {
      throw new Error('Backup storage paths are built from UUIDs only.');
    }
    return join(this.root, shopId, `${backupId}.vlbk`);
  }

  /** Writes the file under a temporary name first, so a crash never leaves half a backup. */
  async write(shopId: string, backupId: string, bytes: Uint8Array): Promise<void> {
    const target = this.path(shopId, backupId);
    await mkdir(join(this.root, shopId), { recursive: true });
    const temporary = `${target}.part`;
    await writeFile(temporary, bytes, { flag: 'w' });
    await rename(temporary, target);
  }

  /** A stream of the stored file, or null when it is missing from storage. */
  async open(shopId: string, backupId: string): Promise<ReadStream | null> {
    const target = this.path(shopId, backupId);
    try {
      if (!(await stat(target)).isFile()) return null;
    } catch {
      return null;
    }
    return createReadStream(target);
  }

  async remove(shopId: string, backupId: string): Promise<void> {
    await rm(this.path(shopId, backupId), { force: true });
  }
}
