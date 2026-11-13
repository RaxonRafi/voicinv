import {
  BadRequestException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { AppException } from './app.exception.js';
import { ErrorCode } from './error-code.js';
import { toErrorResponse } from './error-response.js';

describe('toErrorResponse', () => {
  it('keeps the code, message and details of an AppException', () => {
    const details = [{ field: 'email', messages: ['must be an email'] }];
    const result = toErrorResponse(
      new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, 'Invalid', details),
    );
    expect(result).toEqual({
      status: 400,
      body: { error: { code: 'VALIDATION_FAILED', message: 'Invalid', details } },
    });
  });

  it('omits details when there are none', () => {
    const result = toErrorResponse(
      new AppException(HttpStatus.CONFLICT, ErrorCode.CONFLICT, 'Already exists'),
    );
    expect(result.body.error).toEqual({ code: 'CONFLICT', message: 'Already exists' });
  });

  it('maps standard HTTP exceptions to codes by status', () => {
    expect(toErrorResponse(new NotFoundException('Cannot GET /nope'))).toEqual({
      status: 404,
      body: { error: { code: 'NOT_FOUND', message: 'Cannot GET /nope' } },
    });
    expect(toErrorResponse(new HttpException('Slow down', 429)).body.error.code).toBe(
      'RATE_LIMITED',
    );
    expect(toErrorResponse(new HttpException('Teapot', 418)).body.error.code).toBe('BAD_REQUEST');
  });

  it('joins array messages from built-in pipes', () => {
    const result = toErrorResponse(new BadRequestException(['a is wrong', 'b is wrong']));
    expect(result.body.error.message).toBe('a is wrong; b is wrong');
  });

  it('never leaks details of server errors', () => {
    const fromHttp = toErrorResponse(new InternalServerErrorException('db password is hunter2'));
    expect(fromHttp.status).toBe(500);
    expect(fromHttp.body.error.code).toBe('INTERNAL_ERROR');
    expect(fromHttp.body.error.message).not.toContain('hunter2');

    const fromUnknown = toErrorResponse(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    expect(fromUnknown.status).toBe(500);
    expect(fromUnknown.body.error.message).not.toContain('ECONNREFUSED');
  });

  it('handles non-Error throwables', () => {
    expect(toErrorResponse('boom').status).toBe(500);
    expect(toErrorResponse(undefined).body.error.code).toBe('INTERNAL_ERROR');
  });
});
