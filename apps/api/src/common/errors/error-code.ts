/** Stable error codes returned in `{ error: { code } }`. Clients switch on these, not on messages. */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  /** Wrong identifier or password. Deliberately the same for unknown accounts. */
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  /** The phone number or email already has an account. */
  IDENTIFIER_TAKEN: 'IDENTIFIER_TAKEN',
  /** The refresh token is unknown, expired or revoked: the user must sign in again. */
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  /** Wrong identifier or recovery code. */
  INVALID_RECOVERY_CODE: 'INVALID_RECOVERY_CODE',
  /** A push tried to change or delete a financial record; those can only be added. */
  APPEND_ONLY_VIOLATION: 'APPEND_ONLY_VIOLATION',
  /** The uploaded backup is not an encrypted VoiceLedger backup, or arrived damaged. */
  INVALID_BACKUP: 'INVALID_BACKUP',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const BY_STATUS: Readonly<Record<number, ErrorCode>> = {
  400: ErrorCode.BAD_REQUEST,
  401: ErrorCode.UNAUTHORIZED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  413: ErrorCode.PAYLOAD_TOO_LARGE,
  429: ErrorCode.RATE_LIMITED,
  503: ErrorCode.SERVICE_UNAVAILABLE,
};

export function errorCodeForStatus(status: number): ErrorCode {
  return BY_STATUS[status] ?? (status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST);
}
