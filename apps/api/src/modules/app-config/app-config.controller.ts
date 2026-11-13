import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';

import { AppConfigService, type ClientAppConfig } from './app-config.service.js';

class AppConfigDto implements ClientAppConfig {
  @ApiProperty({ example: '0.1.0', description: 'Oldest app version allowed to sync.' })
  minSupportedVersion: string;

  @ApiProperty({ example: '0.1.0' })
  latestVersion: string;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'boolean' } })
  featureFlags: Record<string, boolean>;
}

@ApiTags('app-config')
@Controller('app-config')
export class AppConfigController {
  constructor(private readonly appConfig: AppConfigService) {}

  @Get()
  // Public and the same for everyone, so it may be cached briefly.
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({ summary: 'Minimum supported app version and feature flags' })
  @ApiOkResponse({ type: AppConfigDto })
  get(): ClientAppConfig {
    return this.appConfig.get();
  }
}
