import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import { type AuthContext } from '../auth/access-token.js';
import { type AuthenticatedRequest } from '../guards/auth.guard.js';

/** The authenticated caller. Only valid on routes protected by `AuthGuard`. */
export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => {
    const { auth } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!auth) throw new Error('@CurrentAuth() used on a route without AuthGuard.');
    return auth;
  },
);
