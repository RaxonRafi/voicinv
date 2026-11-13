import { type NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { type App } from 'supertest/types.js';
import { DataSource } from 'typeorm';

import { createTestSchema } from './test-database.js';

export interface TestApp {
  app: NestExpressApplication;
  server: App;
  dataSource: DataSource;
  close(): Promise<void>;
}

/** The only browser origin the test app allows. */
export const TEST_ORIGIN = 'http://localhost:3000';

/**
 * Boots the real application (same modules, pipes, filters and HTTP setup as production)
 * against a freshly migrated throwaway schema.
 */
export async function createTestApp(): Promise<TestApp> {
  const database = await createTestSchema();

  try {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: database.url,
      DATABASE_SCHEMA: database.schema,
      CORS_ORIGINS: TEST_ORIGIN,
      // Lets tests choose a client IP per request with X-Forwarded-For.
      TRUST_PROXY: '1',
      LOG_LEVEL: 'silent',
    });

    // Imported after the environment is prepared: ConfigModule validates it at import time.
    const { AppModule } = await import('../../src/app.module.js');
    const { configureApp } = await import('../../src/app.setup.js');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();

    const dataSource = app.get(DataSource);
    await dataSource.runMigrations();

    return {
      app,
      server: app.getHttpServer(),
      dataSource,
      close: async () => {
        await app.close();
        await database.drop();
      },
    };
  } catch (error) {
    await database.drop();
    throw error;
  }
}

let ipCounter = 0;

/** A new client IP for each call, so unrelated requests do not share a rate-limit bucket. */
export function nextClientIp(): string {
  ipCounter += 1;
  return `10.${(ipCounter >> 16) & 0xff}.${(ipCounter >> 8) & 0xff}.${ipCounter & 0xff}`;
}
