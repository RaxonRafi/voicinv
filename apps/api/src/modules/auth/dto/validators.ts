import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  isEmail,
  IsString,
  MaxLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

import { parseIdentifier } from '../../users/index.js';

@ValidatorConstraint({ name: 'isIdentifier', async: false })
class IdentifierConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const identifier = parseIdentifier(value);
    return identifier !== null && (identifier.kind === 'phone' || isEmail(identifier.value));
  }

  defaultMessage(): string {
    return 'Enter a valid phone number or email address.';
  }
}

/**
 * An account identifier: a phone number or an email address. The value is normalized first
 * (emails lowercased, phone separators removed), so sign-up and sign-in always agree.
 */
export function IsIdentifier(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? (parseIdentifier(value)?.value ?? value.trim()) : value,
    ),
    IsString(),
    MaxLength(254),
    Validate(IdentifierConstraint),
  );
}

export const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
