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

/** Development-only signing secrets. Production must set its own (checked below). */
const DEV_ACCESS_SECRET = 'development-only-access-secret-do-not-use-in-production';
const DEV_REFRESH_SECRET = 'development-only-refresh-secret-do-not-use-in-production';

const appVersion = z.string().regex(/^\d+\.\d+\.\d+$/, 'must look like 1.2.3');

/** `sync=true,cloudBackup=false` → `{ sync: true, cloudBackup: false }`. */
const featureFlags = z
  .string()
  .default('')
  .transform((value, context) => {
    const flags: Record<string, boolean> = {};
    for (const part of value.split(',')) {
      const entry = part.trim();
      if (entry === '') continue;
      const match = /^([A-Za-z][A-Za-z0-9_]*)=(true|false)$/.exec(entry);
      const name = match?.[1];
      if (!name) {
        context.addIssue({ code: 'custom', message: 'must be a list like name=true,other=false' });
        return z.NEVER;
      }
      flags[name] = match[2] === 'true';
    }
    return flags;
  });

const baseEnvSchema = z.object({
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

  // Access tokens are signed JWTs. Refresh tokens are random values stored only as an HMAC
  // keyed with JWT_REFRESH_SECRET, so a leaked database cannot be replayed against the API.
  JWT_ACCESS_SECRET: z.preprocess(emptyAsUndefined, z.string().min(32).default(DEV_ACCESS_SECRET)),
  JWT_REFRESH_SECRET: z.preprocess(
    emptyAsUndefined,
    z.string().min(32).default(DEV_REFRESH_SECRET),
  ),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().min(3600).default(2_592_000),

  MIN_APP_VERSION: appVersion.default('0.1.0'),
  LATEST_APP_VERSION: appVersion.default('0.1.0'),
  FEATURE_FLAGS: featureFlags,

  // Encrypted cloud backups are stored as files in this folder (a disk volume in production).
  BACKUP_STORAGE_DIR: z.preprocess(emptyAsUndefined, z.string().min(1).default('./data/backups')),
  /** Largest backup accepted, in bytes (default 25 MB). */
  BACKUP_MAX_BYTES: z.coerce.number().int().min(1024).max(1_073_741_824).default(26_214_400),
  /** Backups kept per shop; older ones are removed when a new one arrives. */
  BACKUPS_TO_KEEP: z.coerce.number().int().min(1).max(100).default(10),
});

export const envSchema = baseEnvSchema.superRefine((env, context) => {
  if (env.NODE_ENV !== 'production') return;
  const secrets = [
    ['JWT_ACCESS_SECRET', env.JWT_ACCESS_SECRET, DEV_ACCESS_SECRET],
    ['JWT_REFRESH_SECRET', env.JWT_REFRESH_SECRET, DEV_REFRESH_SECRET],
  ] as const;
  for (const [name, value, developmentDefault] of secrets) {
    if (value === developmentDefault) {
      context.addIssue({
        code: 'custom',
        path: [name],
        message: 'must be set to a private random value in production',
      });
    }
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    context.addIssue({
      code: 'custom',
      path: ['JWT_REFRESH_SECRET'],
      message: 'must differ from JWT_ACCESS_SECRET',
    });
  }
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
