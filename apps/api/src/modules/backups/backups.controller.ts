import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle, minutes } from '@nestjs/throttler';
import { type Request } from 'express';

import { type AuthContext, AuthGuard, CurrentAuth, ZodValidationPipe } from '../../common/index.js';
import {
  type BackupMetadata,
  type BackupUploadQuery,
  backupUploadQuerySchema,
} from '../../shared/index.js';
import { BackupsService } from './backups.service.js';

/** Backup uploads per client IP per minute. Backups are large; a few are plenty. */
export const BACKUP_UPLOADS_PER_MINUTE = 6;

@ApiTags('backups')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('backups')
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: BACKUP_UPLOADS_PER_MINUTE, ttl: minutes(1) } })
  @ApiOperation({ summary: 'Upload a backup that was encrypted on the device' })
  @ApiConsumes('application/octet-stream')
  @ApiBody({ schema: { type: 'string', format: 'binary' } })
  @ApiQuery({ name: 'checksum', description: 'SHA-256 of the uploaded bytes, hex encoded.' })
  @ApiQuery({ name: 'deviceId', required: false })
  @ApiCreatedResponse({ description: 'Metadata of the stored backup.' })
  @ApiBadRequestResponse({ description: 'Not an encrypted backup, or damaged in transit' })
  upload(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(backupUploadQuerySchema)) query: BackupUploadQuery,
    @Req() request: Request,
  ): Promise<BackupMetadata> {
    // `request.body` is a Buffer for application/octet-stream (see app.setup.ts).
    return this.backups.upload(auth, query, request.body);
  }

  @Get()
  @ApiOperation({ summary: 'The shop’s backups, newest first' })
  @ApiOkResponse({ description: 'Backup metadata; the files are downloaded one by one.' })
  list(@CurrentAuth() auth: AuthContext): Promise<BackupMetadata[]> {
    return this.backups.list(auth);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Download one encrypted backup file' })
  @ApiProduces('application/octet-stream')
  @ApiNotFoundResponse({ description: 'No such backup in this shop' })
  async download(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<StreamableFile> {
    const { metadata, stream } = await this.backups.download(auth, id);
    return new StreamableFile(stream, {
      type: 'application/octet-stream',
      length: metadata.sizeBytes,
      disposition: `attachment; filename="voiceledger-${metadata.id}.vlbk"`,
    });
  }
}
