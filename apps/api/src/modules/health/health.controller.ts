import { Controller, Get, HttpStatus } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { AppException, ErrorCode } from '../../common/index.js';
import { HealthService, type HealthStatus } from './health.service.js';

@ApiTags('health')
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness and database connectivity check' })
  @ApiOkResponse({ description: 'The API and its database are reachable' })
  @ApiServiceUnavailableResponse({ description: 'The database is unreachable' })
  async check(): Promise<HealthStatus> {
    const status = await this.health.check();
    if (status.status !== 'ok') {
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ErrorCode.SERVICE_UNAVAILABLE,
        'The service is temporarily unavailable.',
        status,
      );
    }
    return status;
  }
}
