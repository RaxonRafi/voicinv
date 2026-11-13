import { z } from 'zod';

import { type InvoiceItemRow, type InvoiceRevisionRow, type InvoiceRow } from '@/core/db';
import { LIMITS, type PaymentStatus } from '@/shared';

export const invoiceItemInputSchema = z.object({
  /** The product this line was picked from; null for a line typed or spoken freely. */
  productId: z.string().min(1).nullable(),
  name: z.string().trim().min(1, 'required').max(LIMITS.name, 'tooLong'),
  unit: z.string().trim().min(1, 'required').max(LIMITS.unit, 'tooLong'),
  /** Quantity in thousandths. */
  qtyMilli: z.int('invalidQuantity').min(1, 'invalidQuantity'),
  /** Price per unit in minor units. */
  unitPrice: z.int('invalidAmount').min(0, 'invalidAmount'),
});
export type InvoiceItemInput = z.infer<typeof invoiceItemInputSchema>;

export const paymentInstructionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('FULL') }),
  z.object({ type: z.literal('NONE') }),
  z.object({ type: z.literal('AMOUNT'), amount: z.int().min(0) }),
  z.object({
    type: z.literal('FRACTION'),
    numerator: z.int().min(0),
    denominator: z.int().min(1),
  }),
]);

export const invoiceInputSchema = z.object({
  /** Null = walk-in sale, which must be paid in full. */
  customerId: z.string().min(1).nullable(),
  items: z.array(invoiceItemInputSchema).min(1, 'required').max(LIMITS.invoiceItems, 'tooLong'),
  discount: z.int('invalidAmount').min(0, 'invalidAmount'),
  /** How much the customer pays now. */
  payment: paymentInstructionSchema,
  /** What the shopkeeper said or typed, kept with the invoice for the audit trail. */
  sourceText: z.string().max(LIMITS.sourceText).nullable(),
});
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;

export interface InvoiceListRow {
  invoice: InvoiceRow;
  /** Null for a walk-in sale. */
  customerName: string | null;
}

export interface InvoiceDetails extends InvoiceListRow {
  items: InvoiceItemRow[];
  revisions: InvoiceRevisionRow[];
  /** Part of the due amount settled by payments received after the sale. */
  settledLater: number;
}

/** What a badge shows for an invoice. */
export type InvoiceBadgeStatus = PaymentStatus | 'CANCELLED';

export type { InvoiceItemRow, InvoiceRevisionRow, InvoiceRow };
