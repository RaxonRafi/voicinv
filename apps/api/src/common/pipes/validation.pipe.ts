import { HttpStatus, ValidationPipe, type ValidationError } from '@nestjs/common';

import { AppException } from '../errors/app.exception.js';
import { ErrorCode } from '../errors/error-code.js';

export interface FieldError {
  field: string;
  messages: string[];
}

/** Flattens class-validator's nested error tree into `[{ field: 'a.b', messages }]`. */
export function flattenValidationErrors(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = error.constraints ? [{ field, messages: Object.values(error.constraints) }] : [];
    return [...own, ...flattenValidationErrors(error.children ?? [], field)];
  });
}

/**
 * Global validation: unknown properties are rejected, payloads are transformed into DTO
 * instances, and failures use the shared error envelope with per-field details.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_FAILED,
        'Request validation failed.',
        flattenValidationErrors(errors),
      ),
  });
}
