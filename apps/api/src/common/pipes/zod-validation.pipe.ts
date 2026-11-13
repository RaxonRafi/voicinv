import { HttpStatus, type PipeTransform } from '@nestjs/common';
import { type z } from 'zod';

import { AppException } from '../errors/app.exception.js';
import { ErrorCode } from '../errors/error-code.js';
import { type FieldError } from './validation.pipe.js';

/** At most this many problems are reported back; a bad payload can contain thousands. */
const MAX_REPORTED_ISSUES = 20;

/** Groups Zod issues into the same `[{ field: 'a.b', messages }]` shape DTO validation uses. */
export function zodIssuesToFieldErrors(issues: readonly z.core.$ZodIssue[]): FieldError[] {
  const byField = new Map<string, string[]>();
  for (const issue of issues.slice(0, MAX_REPORTED_ISSUES)) {
    const field = issue.path.map(String).join('.') || '(root)';
    byField.set(field, [...(byField.get(field) ?? []), issue.message]);
  }
  return [...byField].map(([field, messages]) => ({ field, messages }));
}

/**
 * Validates a request part against a Zod schema. Used where the contract is a shared schema
 * from `src/shared` (the sync protocol) rather than a class-validator DTO, so the API and
 * the mobile app check exactly the same rules.
 */
export class ZodValidationPipe<Schema extends z.ZodType> implements PipeTransform<
  unknown,
  z.output<Schema>
> {
  constructor(private readonly schema: Schema) {}

  transform(value: unknown): z.output<Schema> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_FAILED,
        'Request validation failed.',
        zodIssuesToFieldErrors(result.error.issues),
      );
    }
    return result.data;
  }
}
