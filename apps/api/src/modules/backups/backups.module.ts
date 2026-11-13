import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DevicesModule } from '../devices/index.js';
import { BackupStorage } from './backup-storage.js';
import { BackupsController } from './backups.controller.js';
import { BackupsRepository } from './backups.repository.js';
import { BackupsService } from './backups.service.js';
import { Backup } from './entities/backup.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Backup]), DevicesModule],
  controllers: [BackupsController],
  providers: [BackupsService, BackupsRepository, BackupStorage],
})
export class BackupsModule {}
