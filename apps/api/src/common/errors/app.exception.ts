import { HttpException, type HttpStatus } from '@nestjs/common';

import { type ErrorCode } from './error-code.js';

/**
 * Application error with a stable machine-readable code. Services throw this (or a standard
 * Nest `HttpException`); the global filter turns both into `{ error: { code, message, details? } }`.
 */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message, status);
  }
}
