import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import {
  AllExceptionsFilter,
  ResponseEnvelopeInterceptor,
  createValidationPipe,
} from './common/index.js';
import { type AppConfigService, validateEnv } from './config/index.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './modules/health/index.js';
import { WaitlistModule } from './modules/waitlist/index.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: AppConfigService) => {
        const env = config.get('NODE_ENV', { infer: true });
        return {
          pinoHttp: {
            level: config.get('LOG_LEVEL', { infer: true }),
            autoLogging: env !== 'test',
            // Never log credentials. Request bodies are not logged at all.
            redact: ['req.headers.authorization', 'req.headers.cookie'],
            ...(env === 'development'
              ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
              : {}),
          },
        };
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: AppConfigService) => [
        {
          ttl: seconds(config.get('THROTTLE_TTL_SECONDS', { infer: true })),
          limit: config.get('THROTTLE_LIMIT', { infer: true }),
        },
      ],
    }),
    DatabaseModule,
    HealthModule,
    WaitlistModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
