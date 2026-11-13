import { type ValueTransformer } from 'typeorm';

/**
 * For Postgres `bigint` columns (money in minor units, sequence numbers). Values are handled
 * as JavaScript integers; anything that is not a safe integer is refused instead of being
 * silently rounded (AGENTS.md §6.2).
 */
export const safeBigint: ValueTransformer = {
  to(value: number | null | undefined): number | null | undefined {
    if (value == null) return value;
    if (!Number.isSafeInteger(value)) {
      throw new RangeError(`Refusing to store ${String(value)}: not a safe integer.`);
    }
    return value;
  },
  from(value: string | number | null): number | null {
    if (value === null) return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(parsed)) {
      throw new RangeError(`Database value ${String(value)} exceeds Number.MAX_SAFE_INTEGER.`);
    }
    return parsed;
  },
};
