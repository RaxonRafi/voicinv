/** Postgres error code for a violated UNIQUE or PRIMARY KEY constraint. */
const UNIQUE_VIOLATION = '23505';

interface DriverError {
  code?: unknown;
  constraint?: unknown;
}

/**
 * The name of the violated unique constraint, or null when `error` is not a unique violation.
 * TypeORM wraps the driver error in `QueryFailedError.driverError`; both shapes are handled.
 */
export function uniqueViolationConstraint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const wrapped = (error as { driverError?: unknown }).driverError;
  const driver = (typeof wrapped === 'object' && wrapped !== null ? wrapped : error) as DriverError;
  if (driver.code !== UNIQUE_VIOLATION) return null;
  return typeof driver.constraint === 'string' ? driver.constraint : '';
}
