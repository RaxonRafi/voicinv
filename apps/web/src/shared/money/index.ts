import * as money from './money';

export type { MinorUnits } from './money';
export { DEFAULT_CURRENCY_EXPONENT, QUANTITY_SCALE } from './money';

/**
 * Money utilities. All amounts are integers in minor units; use these functions instead of
 * arithmetic operators so overflow and accidental fractions are caught.
 */
export const Money = {
  isMinorUnits: money.isMinorUnits,
  assert: money.assertMinorUnits,
  add: money.add,
  sum: money.sum,
  subtract: money.subtract,
  negate: money.negate,
  multiplyByQuantity: money.multiplyByQuantity,
  fraction: money.fraction,
  compare: money.compare,
  min: money.min,
  max: money.max,
  clamp: money.clamp,
  toDecimalString: money.toDecimalString,
  fromDecimalString: money.fromDecimalString,
} as const;

/** Quantity helpers. Quantities are integers in thousandths (`qtyMilli`). */
export const Quantity = {
  SCALE: money.QUANTITY_SCALE,
  fromDecimalString: money.quantityFromDecimalString,
  toDecimalString: money.quantityToDecimalString,
} as const;
