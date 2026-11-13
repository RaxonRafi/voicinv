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

  it('reports every problem at once', () => {
    expect(() => validateEnv({ PORT: 'abc' })).toThrow(
      /PORT[\s\S]*DATABASE_URL[\s\S]*CORS_ORIGINS/,
    );
  });
});
