import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export const WAITLIST_LOCALES = ['en', 'bn'] as const;
export type WaitlistLocale = (typeof WAITLIST_LOCALES)[number];

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Empty optional form fields arrive as "" — treat them as not provided. */
const trimToUndefined = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

export class CreateWaitlistEntryDto {
  @ApiPropertyOptional({
    example: 'karim@example.com',
    description: 'Email address. Either email or phone is required.',
  })
  @Transform(({ value }) => {
    const trimmed = trimToUndefined({ value });
    return typeof trimmed === 'string' ? trimmed.toLowerCase() : trimmed;
  })
  // Validated when present, and also when no phone was given so "neither" is rejected.
  @ValidateIf((dto: CreateWaitlistEntryDto) => dto.email !== undefined || dto.phone === undefined)
  @IsEmail({}, { message: 'Enter a valid email address or a phone number.' })
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({
    example: '+8801712345678',
    description:
      'Phone number, digits with an optional leading +. Either email or phone is required.',
  })
  @Transform(({ value }) => {
    const trimmed = trimToUndefined({ value });
    return typeof trimmed === 'string' ? trimmed.replace(/[\s\-().]/g, '') : trimmed;
  })
  @IsOptional()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'Enter a valid phone number.' })
  phone?: string;

  @ApiPropertyOptional({ example: 'Karim Uddin' })
  @Transform(trimToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiProperty({ enum: WAITLIST_LOCALES, example: 'bn' })
  @IsIn(WAITLIST_LOCALES)
  locale: WaitlistLocale;

  @ApiPropertyOptional({ example: 'grocery' })
  @Transform(trimToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  shopType?: string;

  @ApiPropertyOptional({
    description: 'Honeypot. Real visitors never see or fill this field; leave it empty.',
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}
