import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WaitlistEntry } from './entities/waitlist-entry.entity.js';
import { WaitlistController } from './waitlist.controller.js';
import { WaitlistRepository } from './waitlist.repository.js';
import { WaitlistService } from './waitlist.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([WaitlistEntry])],
  controllers: [WaitlistController],
  providers: [WaitlistService, WaitlistRepository],
})
export class WaitlistModule {}
