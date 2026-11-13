import { type ConfigService } from '@nestjs/config';

import { type Env, validateEnv } from '../../../config/index.js';
import { AppConfigService } from '../app-config.service.js';

function serviceFor(overrides: Record<string, string> = {}): AppConfigService {
  const env = validateEnv({
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    CORS_ORIGINS: 'http://localhost:3000',
    ...overrides,
  });
  const config = { get: (key: keyof Env) => env[key] } as unknown as ConfigService<Env, true>;
  return new AppConfigService(config);
}

describe('AppConfigService', () => {
  it('reports the default versions and no flags', () => {
    expect(serviceFor().get()).toEqual({
      minSupportedVersion: '0.1.0',
      latestVersion: '0.1.0',
      featureFlags: {},
    });
  });

  it('reports configured versions and feature flags', () => {
    const config = serviceFor({
      MIN_APP_VERSION: '1.2.0',
      LATEST_APP_VERSION: '1.4.3',
      FEATURE_FLAGS: 'sync=true, cloudBackup=false',
    }).get();

    expect(config).toEqual({
      minSupportedVersion: '1.2.0',
      latestVersion: '1.4.3',
      featureFlags: { sync: true, cloudBackup: false },
    });
  });
});
