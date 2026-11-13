import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Shop } from './entities/shop.entity.js';
import { ShopsRepository } from './shops.repository.js';
import { ShopsService } from './shops.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Shop])],
  providers: [ShopsService, ShopsRepository],
  exports: [ShopsService],
})
export class ShopsModule {}
