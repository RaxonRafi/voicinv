import { HttpException, HttpStatus } from '@nestjs/common';

import { AppException } from './app.exception.js';
import { ErrorCode, errorCodeForStatus } from './error-code.js';

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export interface ErrorResponse {
  status: number;
  body: ErrorBody;
}

const INTERNAL_MESSAGE = 'Something went wrong. Please try again.';

function messageOf(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') return response;
  if (typeof response === 'object' && response !== null && 'message' in response) {
    const { message } = response;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join('; ');
  }
  return exception.message;
}

/**
 * Maps any thrown value to the public error envelope. Pure, so it can be unit tested.
 * Unknown errors and 5xx responses never leak internal messages or stack traces.
 */
export function toErrorResponse(exception: unknown): ErrorResponse {
  if (exception instanceof AppException) {
    return {
      status: exception.getStatus(),
      body: {
        error: {
          code: exception.code,
          message: exception.message,
          ...(exception.details === undefined ? {} : { details: exception.details }),
        },
      },
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const isServerError = status >= HttpStatus.INTERNAL_SERVER_ERROR;
    return {
      status,
      body: {
        error: {
          code: errorCodeForStatus(status),
          message: isServerError ? INTERNAL_MESSAGE : messageOf(exception),
        },
      },
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: { error: { code: ErrorCode.INTERNAL_ERROR, message: INTERNAL_MESSAGE } },
  };
}
