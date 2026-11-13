import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type Env } from '../../config/index.js';

/** Mirrors `appConfigSchema` in `src/shared`. */
export interface ClientAppConfig {
  /** Oldest app version allowed to use account features, as `major.minor.patch`. */
  minSupportedVersion: string;
  latestVersion: string;
  featureFlags: Record<string, boolean>;
}

/** What the mobile app needs to know before it talks to the rest of the API. */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get(): ClientAppConfig {
    return {
      minSupportedVersion: this.config.get('MIN_APP_VERSION', { infer: true }),
      latestVersion: this.config.get('LATEST_APP_VERSION', { infer: true }),
      featureFlags: { ...this.config.get('FEATURE_FLAGS', { infer: true }) },
    };
  }
}
