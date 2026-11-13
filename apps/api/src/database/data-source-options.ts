import { type DataSourceOptions } from 'typeorm';

import { migrations } from './migrations/index.js';

export interface DatabaseSettings {
  url: string;
  /** Optional Postgres schema to run in. Requires a direct (non-pgbouncer) connection. */
  schema?: string | undefined;
}

/**
 * TypeORM options shared by the running app, the migration CLI and the tests.
 * `synchronize` is always off: every schema change is a reviewed migration (AGENTS.md §6.2).
 */
export function buildDataSourceOptions(settings: DatabaseSettings): DataSourceOptions {
  return {
    type: 'postgres',
    url: settings.url,
    synchronize: false,
    migrationsRun: false,
    migrations,
    migrationsTableName: 'migrations',
    // Return int8 (money in minor units, sequences) as numbers; a column transformer guards
    // against values beyond Number.MAX_SAFE_INTEGER.
    parseInt8: true,
    ...(settings.schema ? { extra: { options: `-c search_path=${settings.schema}` } } : {}),
  };
}
