import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { type AppConfigService } from '../config/index.js';
import { buildDataSourceOptions } from './data-source-options.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: AppConfigService) => ({
        ...buildDataSourceOptions({
          url: config.get('DATABASE_URL', { infer: true }),
          schema: config.get('DATABASE_SCHEMA', { infer: true }),
        }),
        // Each feature module registers its own entities with TypeOrmModule.forFeature.
        autoLoadEntities: true,
      }),
    }),
  ],
})
export class DatabaseModule {}
