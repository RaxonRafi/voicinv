import { z } from 'zod';

const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\/.+/, 'must be a postgres:// or postgresql:// connection URL');

const originList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter((origin) => origin.length > 0),
  )
  .pipe(
    z
      .array(z.string().regex(/^https?:\/\/[^/]+$/, 'must be an origin like https://example.com'))
      .min(1),
  );

/** Treats an empty string (e.g. `KEY=` in a .env file) the same as an unset variable. */
const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),

  DATABASE_URL: postgresUrl,
  DATABASE_URL_UNPOOLED: z.preprocess(emptyAsUndefined, postgresUrl.optional()),
  DATABASE_SCHEMA: z.preprocess(
    emptyAsUndefined,
    z
      .string()
      .regex(/^[a-z_][a-z0-9_]{0,62}$/, 'must be a lowercase Postgres identifier')
      .optional(),
  ),

  CORS_ORIGINS: originList,
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  THROTTLE_TTL_SECONDS: z.coerce.number().int().min(1).default(60),
  THROTTLE_LIMIT: z.coerce.number().int().min(1).default(120),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates process configuration at startup. The API must refuse to start when a variable is
 * missing or malformed (AGENTS.md §12), so this throws with every problem listed at once.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
