// Migration CLI: `node dist/database/migrate.js <run|revert|show>` (see package.json scripts).
// Uses the direct connection (DATABASE_URL_UNPOOLED) when available, because schema changes
// should not go through pgbouncer.
import { existsSync } from 'node:fs';

import { DataSource } from 'typeorm';

import { buildDataSourceOptions } from './data-source-options.js';

type Command = 'run' | 'revert' | 'show';

function isCommand(value: string | undefined): value is Command {
  return value === 'run' || value === 'revert' || value === 'show';
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (!isCommand(command)) {
    throw new Error('Usage: migrate <run|revert|show>');
  }

  if (existsSync('.env')) process.loadEnvFile('.env');
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL (or DATABASE_URL_UNPOOLED) must be set to run migrations.');
  }

  const dataSource = new DataSource(
    buildDataSourceOptions({ url, schema: process.env.DATABASE_SCHEMA || undefined }),
  );
  await dataSource.initialize();
  try {
    if (command === 'run') {
      const applied = await dataSource.runMigrations({ transaction: 'each' });
      console.warn(
        applied.length === 0
          ? 'No pending migrations.'
          : `Applied ${applied.length} migration(s):\n${applied.map((m) => `  - ${m.name}`).join('\n')}`,
      );
    } else if (command === 'revert') {
      await dataSource.undoLastMigration({ transaction: 'each' });
      console.warn('Reverted the last migration.');
    } else {
      const pending = await dataSource.showMigrations();
      console.warn(pending ? 'There are pending migrations.' : 'Database is up to date.');
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
