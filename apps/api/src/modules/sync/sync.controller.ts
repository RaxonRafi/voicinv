import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { type AuthContext, AuthGuard, CurrentAuth, ZodValidationPipe } from '../../common/index.js';
import {
  type SyncPullQuery,
  syncPullQuerySchema,
  type SyncPullResponse,
  type SyncPushRequest,
  syncPushRequestSchema,
  type SyncPushResponse,
} from '../../shared/index.js';
import { SyncService } from './sync.service.js';

// Requests and responses are defined by the Zod contracts in `src/shared/sync`, the same
// schemas the mobile app validates against, so they are checked with those instead of DTOs.

@ApiTags('sync')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('pull')
  @ApiOperation({ summary: 'Changes of the shop since a cursor, one page at a time' })
  @ApiQuery({ name: 'cursor', example: '0', description: 'Cursor from the previous pull or push.' })
  @ApiOkResponse({ description: '`{ changes, cursor, hasMore }`; pull again while hasMore.' })
  pull(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(syncPullQuerySchema)) query: SyncPullQuery,
  ): Promise<SyncPullResponse> {
    return this.sync.pull(auth, query.cursor);
  }

  @Post('push')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply the device’s local changes in one transaction' })
  @ApiBody({
    description: '`{ deviceId, lastPulledCursor, changes }` grouped by table.',
    schema: { type: 'object' },
  })
  @ApiOkResponse({ description: '`{ applied, conflicts, cursor }`.' })
  @ApiForbiddenResponse({ description: 'A record or the device belongs to another shop' })
  push(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(syncPushRequestSchema)) body: SyncPushRequest,
  ): Promise<SyncPushResponse> {
    return this.sync.push(auth, body);
  }
}
