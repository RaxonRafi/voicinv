import { ConfigService } from '@nestjs/config';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { type AppConfigService } from './config/index.js';

export const API_PREFIX = 'api/v1';
export const DOCS_PATH = 'api/docs';
/** Largest JSON request body accepted (a full sync push fits comfortably). */
export const JSON_BODY_LIMIT = '4mb';

/**
 * HTTP-level setup shared by `main.ts` and the e2e tests, so tests exercise the same prefix,
 * security headers, CORS allow-list and proxy handling as production.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<AppConfigService>(ConfigService);

  // Set before the OpenAPI document is built, so documented paths carry the versioned prefix.
  app.setGlobalPrefix(API_PREFIX);

  // OpenAPI docs are a development aid only. Registered before helmet so the Swagger UI page
  // is not subject to the strict Content-Security-Policy used for the API itself.
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('VoiceLedger API')
        .setDescription(
          'Optional accounts, sync, encrypted backups, billing and waitlist. ' +
            'Success responses are `{ data }`; errors are `{ error: { code, message, details? } }`.',
        )
        .setVersion('1')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup(DOCS_PATH, app, document);
  }

  // A sync push carries up to SYNC_PUSH_MAX_RECORDS records, so JSON bodies may be larger
  // than Express' 100 kB default. Encrypted backups arrive as raw bytes.
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.useBodyParser('raw', {
    type: 'application/octet-stream',
    limit: config.get('BACKUP_MAX_BYTES', { infer: true }),
  });

  app.set('trust proxy', config.get('TRUST_PROXY', { infer: true }));
  app.disable('x-powered-by');
  app.use(helmet());
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });
  app.enableShutdownHooks();
}
