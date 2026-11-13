import { ApiProperty } from '@nestjs/swagger';

// Response bodies of /auth and /me (inside the `{ data }` envelope).

export class AuthTokensDto {
  @ApiProperty({ description: 'Short-lived JWT for the Authorization header.' })
  accessToken: string;

  @ApiProperty({ description: 'Single-use token for POST /auth/refresh.' })
  refreshToken: string;

  @ApiProperty({ example: 900, description: 'Seconds until the access token expires.' })
  expiresIn: number;
}

export class RegisterResponseDto extends AuthTokensDto {
  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ format: 'uuid' })
  shopId: string;

  @ApiProperty({
    example: 'ABCD-EFGH-JKMN-PQRS',
    description: 'Shown once. The only way to reset a forgotten password.',
  })
  recoveryCode: string;
}

export class RecoverResponseDto {
  @ApiProperty({
    example: 'ABCD-EFGH-JKMN-PQRS',
    description: 'The new recovery code; the one just used no longer works.',
  })
  recoveryCode: string;
}

export class LoggedOutDto {
  @ApiProperty({ example: true })
  loggedOut: true;
}

class MeUserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: '+8801712345678' })
  identifier: string;

  @ApiProperty({ description: 'Epoch milliseconds.' })
  createdAt: number;
}

class MeShopDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ example: 'BDT' })
  currencyCode: string;

  @ApiProperty({ example: 'bn' })
  defaultLanguage: string;

  @ApiProperty({ example: 'RS' })
  invoicePrefix: string;
}

export class MeDto {
  @ApiProperty({ type: MeUserDto })
  user: MeUserDto;

  @ApiProperty({ type: MeShopDto })
  shop: MeShopDto;
}
