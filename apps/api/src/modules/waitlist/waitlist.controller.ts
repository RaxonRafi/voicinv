import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle, minutes } from '@nestjs/throttler';

import { CreateWaitlistEntryDto } from './dto/create-waitlist-entry.dto.js';
import { WaitlistJoinedDto } from './dto/waitlist-joined.dto.js';
import { WaitlistService } from './waitlist.service.js';

/** Signups per client IP per minute. Public and unauthenticated, so kept deliberately low. */
export const WAITLIST_SIGNUPS_PER_MINUTE = 5;

@ApiTags('waitlist')
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: WAITLIST_SIGNUPS_PER_MINUTE, ttl: minutes(1) } })
  @ApiOperation({ summary: 'Join the launch waitlist from the landing page' })
  @ApiCreatedResponse({ type: WaitlistJoinedDto })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiTooManyRequestsResponse({ description: 'Too many signups from this address' })
  join(@Body() dto: CreateWaitlistEntryDto): Promise<WaitlistJoinedDto> {
    return this.waitlist.join(dto);
  }
}
