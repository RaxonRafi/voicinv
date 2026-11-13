import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Request } from 'express';

import { type Env } from '../../config/index.js';
import { type AuthContext, verifyAccessToken } from '../auth/access-token.js';
import { AppException } from '../errors/app.exception.js';
import { ErrorCode } from '../errors/error-code.js';

export interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
}

/**
 * Tenant guard: requires a valid `Authorization: Bearer <access token>` header and attaches
 * `{ userId, shopId }` to the request. Handlers read it with `@CurrentAuth()` and scope every
 * query to that shop; a `shopId` sent by the client is never trusted on its own.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    const secret = this.config.get('JWT_ACCESS_SECRET', { infer: true });
    const auth = token ? verifyAccessToken(token, secret) : null;
    if (!auth) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.UNAUTHORIZED,
        'Sign in again to continue.',
      );
    }
    request.auth = auth;
    return true;
  }
}
