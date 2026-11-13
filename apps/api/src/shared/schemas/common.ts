import { z } from 'zod';

import { LIMITS, SUPPORTED_LANGUAGES } from '../constants.js';

/** Record identifier: a UUID generated on the device (UUIDv7 for new records). */
export const idSchema = z.uuid();

/** Money: a safe integer in minor units. Floats, strings and unsafe integers are rejected. */
export const minorUnitsSchema = z.int();
export const nonNegativeMinorUnitsSchema = z.int().min(0);
export const positiveMinorUnitsSchema = z.int().min(1);

/** Quantity in thousandths (`qtyMilli`). */
export const qtyMilliSchema = z.int().min(1);

/** A point in time as UTC epoch milliseconds. */
export const epochMsSchema = z.int().min(0);

export const languageCodeSchema = z.enum(SUPPORTED_LANGUAGES);

/** ISO 4217 currency code. */
export const currencyCodeSchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'must be a 3-letter currency code');

const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const nameSchema = trimmed(LIMITS.name);
export const unitSchema = trimmed(LIMITS.unit);
export const aliasSchema = trimmed(LIMITS.alias);

/** Phone numbers are stored as digits with an optional leading plus. */
export const phoneSchema = z
  .string()
  .regex(/^\+?[0-9]{7,15}$/, 'must be 7 to 15 digits with an optional leading +');

export const emailSchema = z.email().max(254);
