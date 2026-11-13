import { validateEnv } from './env.schema.js';

const valid = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  CORS_ORIGINS: 'http://localhost:3000',
};

describe('validateEnv', () => {
  it('applies defaults for optional variables', () => {
    const env = validateEnv(valid);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      TRUST_PROXY: 0,
      LOG_LEVEL: 'info',
      THROTTLE_TTL_SECONDS: 60,
      THROTTLE_LIMIT: 120,
    });
    expect(env.DATABASE_SCHEMA).toBeUndefined();
  });

  it('coerces numeric strings', () => {
    expect(validateEnv({ ...valid, PORT: '8080', TRUST_PROXY: '1' })).toMatchObject({
      PORT: 8080,
      TRUST_PROXY: 1,
    });
  });

  it('parses the CORS allow-list and strips trailing slashes', () => {
    const env = validateEnv({
      ...valid,
      CORS_ORIGINS: 'https://voiceledger.app/, https://www.voiceledger.app',
    });
    expect(env.CORS_ORIGINS).toEqual(['https://voiceledger.app', 'https://www.voiceledger.app']);
  });

  it('treats empty optional variables as unset', () => {
    const env = validateEnv({ ...valid, DATABASE_SCHEMA: '', DATABASE_URL_UNPOOLED: '' });
    expect(env.DATABASE_SCHEMA).toBeUndefined();
    expect(env.DATABASE_URL_UNPOOLED).toBeUndefined();
  });

  it('refuses to start without a database URL', () => {
    expect(() => validateEnv({ CORS_ORIGINS: valid.CORS_ORIGINS })).toThrow(/DATABASE_URL/);
  });

  it('refuses to start without a CORS allow-list', () => {
    expect(() => validateEnv({ DATABASE_URL: valid.DATABASE_URL })).toThrow(/CORS_ORIGINS/);
    expect(() => validateEnv({ ...valid, CORS_ORIGINS: ' , ' })).toThrow(/CORS_ORIGINS/);
  });

  it('rejects wildcard and malformed origins', () => {
    expect(() => validateEnv({ ...valid, CORS_ORIGINS: '*' })).toThrow(/CORS_ORIGINS/);
    expect(() => validateEnv({ ...valid, CORS_ORIGINS: 'localhost:3000' })).toThrow(/CORS_ORIGINS/);
  });

  it('rejects non-Postgres database URLs and unsafe schema names', () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
    expect(() => validateEnv({ ...valid, DATABASE_SCHEMA: 'public; drop table x' })).toThrow(
      /DATABASE_SCHEMA/,
    );
  });

  describe('signing secrets', () => {
    const production = {
      ...valid,
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'a'.repeat(48),
      JWT_REFRESH_SECRET: 'b'.repeat(48),
    };

    it('falls back to development secrets outside production', () => {
      const env = validateEnv({ ...valid, JWT_ACCESS_SECRET: '', JWT_REFRESH_SECRET: '' });
      expect(env.JWT_ACCESS_SECRET.length).toBeGreaterThanOrEqual(32);
      expect(env.JWT_REFRESH_SECRET).not.toBe(env.JWT_ACCESS_SECRET);
      expect(env).toMatchObject({
        JWT_ACCESS_TTL_SECONDS: 900,
        JWT_REFRESH_TTL_SECONDS: 2_592_000,
      });
    });

    it('accepts private secrets in production', () => {
      expect(validateEnv(production).JWT_ACCESS_SECRET).toBe('a'.repeat(48));
    });

    it('refuses to start in production without its own secrets', () => {
      expect(() => validateEnv({ ...valid, NODE_ENV: 'production' })).toThrow(
        /JWT_ACCESS_SECRET[\s\S]*JWT_REFRESH_SECRET/,
      );
    });

    it('refuses short secrets and identical secrets', () => {
      expect(() => validateEnv({ ...valid, JWT_ACCESS_SECRET: 'too-short' })).toThrow(
        /JWT_ACCESS_SECRET/,
      );
      expect(() =>
        validateEnv({ ...production, JWT_REFRESH_SECRET: production.JWT_ACCESS_SECRET }),
      ).toThrow(/JWT_REFRESH_SECRET/);
    });
  });

  describe('app config', () => {
    it('parses feature flags', () => {
      expect(
        validateEnv({ ...valid, FEATURE_FLAGS: 'sync=true, cloudBackup=false' }),
      ).toMatchObject({ FEATURE_FLAGS: { sync: true, cloudBackup: false } });
      expect(validateEnv(valid).FEATURE_FLAGS).toEqual({});
    });

    it('rejects malformed feature flags and versions', () => {
      expect(() => validateEnv({ ...valid, FEATURE_FLAGS: 'sync=yes' })).toThrow(/FEATURE_FLAGS/);
      expect(() => validateEnv({ ...valid, FEATURE_FLAGS: 'sync' })).toThrow(/FEATURE_FLAGS/);
      expect(() => validateEnv({ ...valid, MIN_APP_VERSION: '1.0' })).toThrow(/MIN_APP_VERSION/);
    });
  });

  it('reports every problem at once', () => {
    expect(() => validateEnv({ PORT: 'abc' })).toThrow(
      /PORT[\s\S]*DATABASE_URL[\s\S]*CORS_ORIGINS/,
    );
  });
});
