import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { type AuthContext, AuthGuard, CurrentAuth } from '../../common/index.js';
import { DevicesService } from './devices.service.js';
import { DeviceDto } from './dto/device.dto.js';
import { RegisterDeviceDto } from './dto/register-device.dto.js';

@ApiTags('devices')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register this device with the shop and receive its device code' })
  @ApiOkResponse({ type: DeviceDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  async register(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: RegisterDeviceDto,
  ): Promise<DeviceDto> {
    return DeviceDto.from(await this.devices.register(auth, dto));
  }
}
