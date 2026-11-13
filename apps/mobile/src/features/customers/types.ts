import { z } from 'zod';

import { type CustomerRow } from '@/core/db';
import { LIMITS } from '@/shared';

/** What the shopkeeper enters for a customer. Messages are form error codes (core/forms). */
export const customerInputSchema = z.object({
  name: z.string().trim().min(1, 'required').max(LIMITS.name, 'tooLong'),
  /** As typed; may be empty. Normalized and validated by the use case. */
  phone: z.string().max(40, 'invalidPhone'),
  notes: z.string().trim().max(LIMITS.notes, 'tooLong'),
  /** Most the customer may owe, in minor units. Null = no limit. */
  creditLimit: z.int('invalidAmount').min(0, 'invalidAmount').nullable(),
  /** Other names or spellings, in any language; used to match voice input. */
  aliases: z.array(z.string().trim().min(1).max(LIMITS.alias)).max(20),
});

export type CustomerInput = z.infer<typeof customerInputSchema>;

/** A customer with what they currently owe (negative = the shop owes them). */
export interface CustomerWithBalance {
  customer: CustomerRow;
  balance: number;
}

export interface CustomerDetails extends CustomerWithBalance {
  aliases: string[];
}

/** A person picked from the phone's contacts. */
export interface ContactToImport {
  name: string;
  phone?: string;
}

export interface ImportResult {
  added: number;
  /** Contacts skipped because a customer with the same phone or name already exists. */
  skipped: number;
}

export type { CustomerRow };
