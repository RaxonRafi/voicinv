import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

import { PLATFORMS, type Platform } from '../../../shared/index.js';

/** Mirrors `registerDeviceRequestSchema` in `src/shared`. */
export class RegisterDeviceDto {
  @ApiProperty({
    format: 'uuid',
    description: "The device's own ID, generated on first launch.",
  })
  @IsUUID()
  id: string;

  @ApiProperty({ example: 'Counter phone', maxLength: 80 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @ApiProperty({ enum: PLATFORMS })
  @IsIn(PLATFORMS)
  platform: Platform;
}
