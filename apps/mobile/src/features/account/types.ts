export type AccountErrorCode =
  /** The account belongs to another shop and this phone already has records of its own. */
  'DIFFERENT_SHOP';

/** An account problem detected on the phone (server problems arrive as ApiError). */
export class AccountError extends Error {
  constructor(readonly code: AccountErrorCode) {
    super(`Account error: ${code}`);
    this.name = 'AccountError';
  }
}
