import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Backup } from './entities/backup.entity.js';

export interface NewBackup {
  id: string;
  shopId: string;
  deviceId: string | null;
  sizeBytes: number;
  checksum: string;
  formatVersion: number;
}

/** All TypeORM access for the backups module. Every query is keyed by shop. */
@Injectable()
export class BackupsRepository {
  constructor(@InjectRepository(Backup) private readonly backups: Repository<Backup>) {}

  async insert(backup: NewBackup): Promise<Backup> {
    const row = this.backups.create(backup);
    await this.backups.insert(row);
    return row;
  }

  /** The shop's backups, newest first. */
  list(shopId: string): Promise<Backup[]> {
    return this.backups.find({ where: { shopId }, order: { createdAt: 'DESC', id: 'DESC' } });
  }

  find(shopId: string, id: string): Promise<Backup | null> {
    return this.backups.findOneBy({ shopId, id });
  }

  async remove(shopId: string, id: string): Promise<void> {
    await this.backups.delete({ shopId, id });
  }
}
