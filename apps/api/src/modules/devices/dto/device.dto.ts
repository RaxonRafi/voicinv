import { ApiProperty } from '@nestjs/swagger';

import { type Device } from '../entities/device.entity.js';

/** Mirrors `deviceResponseSchema` in `src/shared`. */
export class DeviceDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  shopId: string;

  @ApiProperty({ example: 'B', description: 'Used in invoice numbers, e.g. RS-B-000123.' })
  deviceCode: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true, type: Number, description: 'Epoch milliseconds.' })
  lastSyncAt: number | null;

  static from(device: Device): DeviceDto {
    return {
      id: device.id,
      shopId: device.shopId,
      deviceCode: device.deviceCode,
      name: device.name,
      lastSyncAt: device.lastSyncAt ? device.lastSyncAt.getTime() : null,
    };
  }
}
