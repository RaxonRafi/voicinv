import { z } from 'zod';

import { type ProductRow } from '@/core/db';
import { LIMITS } from '@/shared';

/** What the shopkeeper enters for a product. Messages are form error codes (core/forms). */
export const productInputSchema = z.object({
  name: z.string().trim().min(1, 'required').max(LIMITS.name, 'tooLong'),
  unit: z.string().trim().min(1, 'required').max(LIMITS.unit, 'tooLong'),
  /** Usual price in minor units, or null when the price is asked per sale. */
  defaultPrice: z.int('invalidAmount').min(0, 'invalidAmount').nullable(),
  /** Other names the product is called by, in any language; used to match voice input. */
  aliases: z.array(z.string().trim().min(1).max(LIMITS.alias)).max(20),
});

export type ProductInput = z.infer<typeof productInputSchema>;

export interface ProductDetails {
  product: ProductRow;
  aliases: string[];
}

export type { ProductRow };
