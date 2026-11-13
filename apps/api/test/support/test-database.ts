import { randomBytes } from 'node:crypto';

import pg from 'pg';

export interface TestSchema {
  /** Direct Postgres connection URL. */
  url: string;
  /** Name of the throwaway schema created for this test file. */
  schema: string;
  /** Drops the schema and everything in it. */
  drop(): Promise<void>;
}

async function withClient(url: string, run: (client: pg.Client) => Promise<void>): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await run(client);
  } finally {
    await client.end();
  }
}

/**
 * Creates an isolated schema (`e2e_<random>`) in the test database. Tests run entirely inside
 * it via `search_path`, so they never read or write tables in `public`, and parallel test
 * files cannot interfere with each other.
 */
export async function createTestSchema(): Promise<TestSchema> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL must be set to run e2e tests. Use a direct (non-pooled) Postgres ' +
        'connection; see apps/api/.env.example.',
    );
  }

  // Hex only, so the identifier is safe to interpolate.
  const schema = `e2e_${randomBytes(8).toString('hex')}`;
  await withClient(url, async (client) => {
    await client.query(`CREATE SCHEMA "${schema}"`);
  });

  return {
    url,
    schema,
    drop: () =>
      withClient(url, async (client) => {
        await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      }),
  };
}
