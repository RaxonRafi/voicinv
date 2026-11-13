import { type ConfigService } from '@nestjs/config';

import { type Env } from './env.schema.js';

export { envSchema, validateEnv, type Env } from './env.schema.js';

/** `ConfigService` typed against the validated environment. */
export type AppConfigService = ConfigService<Env, true>;
