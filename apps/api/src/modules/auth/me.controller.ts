import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { type AuthContext, AuthGuard, CurrentAuth } from '../../common/index.js';
import { AuthService } from './auth.service.js';
import { MeDto } from './dto/responses.dto.js';

@ApiTags('auth')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('me')
export class MeController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  @ApiOperation({ summary: 'The signed-in user and their shop' })
  @ApiOkResponse({ type: MeDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  me(@CurrentAuth() auth: AuthContext): Promise<MeDto> {
    return this.auth.me(auth);
  }
}
