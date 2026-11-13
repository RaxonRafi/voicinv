import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DevicesModule } from '../devices/index.js';
import { ShopsModule } from '../shops/index.js';
import { SyncCursor } from './entities/sync-cursor.entity.js';
import { SyncRecord } from './entities/sync-record.entity.js';
import { SyncController } from './sync.controller.js';
import { SyncRepository } from './sync.repository.js';
import { SyncService } from './sync.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([SyncRecord, SyncCursor]), DevicesModule, ShopsModule],
  controllers: [SyncController],
  providers: [SyncService, SyncRepository],
})
export class SyncModule {}
