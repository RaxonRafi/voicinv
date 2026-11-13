import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { API_PREFIX, configureApp } from './app.setup.js';
import { type AppConfigService } from './config/index.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  configureApp(app);

  const port = app.get<AppConfigService>(ConfigService).get('PORT', { infer: true });
  await app.listen(port);
  logger.log(`VoiceLedger API listening on port ${port} under /${API_PREFIX}`, 'Bootstrap');
}

await bootstrap();
