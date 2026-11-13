import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import {
  LIMITS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  SUPPORTED_LANGUAGES,
  type LanguageCode,
} from '../../../shared/index.js';
import { IsIdentifier, trimString } from './validators.js';

// Request bodies of /auth. Each mirrors the Zod schema of the same name in `src/shared`.

export class RegisterShopDto {
  @ApiProperty({
    format: 'uuid',
    description: 'The ID the shop already has on the device; it keeps it in the account.',
  })
  @IsUUID()
  id: string;

  @ApiProperty({ example: 'Rahim Store', maxLength: LIMITS.name })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(LIMITS.name)
  name: string;

  @ApiProperty({ example: 'BDT', description: 'ISO 4217 currency code.' })
  @Matches(/^[A-Z]{3}$/, { message: 'currencyCode must be a 3-letter currency code' })
  currencyCode: string;

  @ApiProperty({ enum: SUPPORTED_LANGUAGES })
  @IsIn(SUPPORTED_LANGUAGES)
  defaultLanguage: LanguageCode;

  @ApiProperty({ example: 'RS', description: 'Prefix of the shop’s invoice numbers.' })
  @Matches(/^[A-Z0-9]{1,6}$/, { message: 'invoicePrefix must be 1 to 6 capital letters or digits' })
  invoicePrefix: string;
}

export class RegisterDto {
  @ApiProperty({ example: '+8801712345678', description: 'Phone number or email address.' })
  @IsIdentifier()
  identifier: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;

  @ApiProperty({ type: RegisterShopDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => RegisterShopDto)
  shop: RegisterShopDto;
}

export class LoginDto {
  @ApiProperty({ example: '+8801712345678', description: 'Phone number or email address.' })
  @IsIdentifier()
  identifier: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  refreshToken: string;
}

export class RecoverDto {
  @ApiProperty({ example: '+8801712345678', description: 'Phone number or email address.' })
  @IsIdentifier()
  identifier: string;

  @ApiProperty({ example: 'ABCD-EFGH-JKMN-PQRS' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  recoveryCode: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  newPassword: string;
}
