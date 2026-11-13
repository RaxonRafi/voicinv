import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle, minutes } from '@nestjs/throttler';

import { AuthService } from './auth.service.js';
import { LoginDto, RecoverDto, RefreshDto, RegisterDto } from './dto/requests.dto.js';
import {
  AuthTokensDto,
  LoggedOutDto,
  RecoverResponseDto,
  RegisterResponseDto,
} from './dto/responses.dto.js';

/** Requests per client IP per minute across /auth. Low, to slow down password guessing. */
export const AUTH_REQUESTS_PER_MINUTE = 10;

@ApiTags('auth')
@Controller('auth')
@Throttle({ default: { limit: AUTH_REQUESTS_PER_MINUTE, ttl: minutes(1) } })
@ApiTooManyRequestsResponse({ description: 'Too many attempts from this address' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an account for the shop on this device' })
  @ApiCreatedResponse({ type: RegisterResponseDto })
  @ApiConflictResponse({ description: 'The identifier or the shop already has an account' })
  register(@Body() dto: RegisterDto): Promise<RegisterResponseDto> {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with a phone number or email and a password' })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiUnauthorizedResponse({ description: 'Wrong identifier or password' })
  login(@Body() dto: LoginDto): Promise<AuthTokensDto> {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for new tokens' })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiUnauthorizedResponse({ description: 'The refresh token is unknown, expired or revoked' })
  refresh(@Body() dto: RefreshDto): Promise<AuthTokensDto> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign out: revoke the refresh token' })
  @ApiOkResponse({ type: LoggedOutDto })
  async logout(@Body() dto: RefreshDto): Promise<LoggedOutDto> {
    await this.auth.logout(dto.refreshToken);
    return { loggedOut: true };
  }

  @Post('recover')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset a forgotten password with the one-time recovery code' })
  @ApiOkResponse({ type: RecoverResponseDto })
  @ApiUnauthorizedResponse({ description: 'Wrong identifier or recovery code' })
  recover(@Body() dto: RecoverDto): Promise<RecoverResponseDto> {
    return this.auth.recover(dto);
  }
}
