import { z } from 'zod';

import { INVOICE_STATUSES, LEDGER_ENTRY_TYPES, LIMITS } from '../constants';
import {
  aliasSchema,
  currencyCodeSchema,
  epochMsSchema,
  idSchema,
  languageCodeSchema,
  minorUnitsSchema,
  nameSchema,
  nonNegativeMinorUnitsSchema,
  phoneSchema,
  positiveMinorUnitsSchema,
  qtyMilliSchema,
  unitSchema,
} from './common';

// Entities as they are stored on the device and exchanged during sync (AGENTS.md §8).
// Field names are identical on mobile, in sync payloads and in the API.

/** Columns of every mutable syncable record. `deletedAt` marks a soft delete. */
const mutableColumns = {
  id: idSchema,
  shopId: idSchema,
  createdAt: epochMsSchema,
  updatedAt: epochMsSchema,
  deletedAt: epochMsSchema.nullable(),
  deviceId: idSchema,
};

/** Columns of every append-only record. These are never updated or deleted. */
const appendOnlyColumns = {
  id: idSchema,
  shopId: idSchema,
  createdAt: epochMsSchema,
  deviceId: idSchema,
};

export const shopSchema = z.strictObject({
  ...mutableColumns,
  name: nameSchema,
  address: z.string().trim().max(LIMITS.address).nullable(),
  phone: phoneSchema.nullable(),
  /** Logo as a data URI, shown on Pro invoices. */
  logo: z.string().max(400_000).nullable(),
  currencyCode: currencyCodeSchema,
  defaultLanguage: languageCodeSchema,
  /** Prefix of this shop's invoice numbers, e.g. "RS". */
  invoicePrefix: z.string().regex(/^[A-Z0-9]{1,6}$/),
});
export type Shop = z.infer<typeof shopSchema>;

export const customerSchema = z.strictObject({
  ...mutableColumns,
  name: nameSchema,
  phone: phoneSchema.nullable(),
  notes: z.string().trim().max(LIMITS.notes).nullable(),
  creditLimit: nonNegativeMinorUnitsSchema.nullable(),
  isArchived: z.boolean(),
});
export type Customer = z.infer<typeof customerSchema>;

export const customerAliasSchema = z.strictObject({
  ...mutableColumns,
  customerId: idSchema,
  alias: aliasSchema,
  languageCode: languageCodeSchema,
});
export type CustomerAlias = z.infer<typeof customerAliasSchema>;

export const productSchema = z.strictObject({
  ...mutableColumns,
  name: nameSchema,
  unit: unitSchema,
  /** Null when the shop has not set a usual price; the price is then asked per sale. */
  defaultPrice: nonNegativeMinorUnitsSchema.nullable(),
  /** Stock in thousandths. Reserved for later stock tracking. */
  stockQty: z.int().nullable(),
  isArchived: z.boolean(),
});
export type Product = z.infer<typeof productSchema>;

export const productAliasSchema = z.strictObject({
  ...mutableColumns,
  productId: idSchema,
  alias: aliasSchema,
  languageCode: languageCodeSchema,
});
export type ProductAlias = z.infer<typeof productAliasSchema>;

export const invoiceSchema = z
  .strictObject({
    ...mutableColumns,
    invoiceNumber: z.string().regex(/^[A-Z0-9]{1,6}-[A-Z]{1,3}-\d{6,}$/),
    /** Null for a walk-in sale. */
    customerId: idSchema.nullable(),
    date: epochMsSchema,
    subtotal: nonNegativeMinorUnitsSchema,
    discount: nonNegativeMinorUnitsSchema,
    total: nonNegativeMinorUnitsSchema,
    paidAmount: nonNegativeMinorUnitsSchema,
    dueAmount: nonNegativeMinorUnitsSchema,
    status: z.enum(INVOICE_STATUSES),
    /** What the shopkeeper said or typed, kept for the audit trail. */
    sourceText: z.string().max(LIMITS.sourceText).nullable(),
  })
  .refine((invoice) => invoice.subtotal - invoice.discount === invoice.total, {
    message: 'total must equal subtotal minus discount',
    path: ['total'],
  })
  .refine((invoice) => invoice.paidAmount + invoice.dueAmount === invoice.total, {
    message: 'paidAmount plus dueAmount must equal total',
    path: ['dueAmount'],
  })
  .refine((invoice) => invoice.customerId !== null || invoice.dueAmount === 0, {
    message: 'a walk-in sale cannot leave an amount due',
    path: ['dueAmount'],
  });
export type Invoice = z.infer<typeof invoiceSchema>;

export const invoiceItemSchema = z.strictObject({
  ...mutableColumns,
  invoiceId: idSchema,
  productId: idSchema.nullable(),
  /** Product name at the time of sale; later renames do not change old invoices. */
  nameSnapshot: nameSchema,
  qtyMilli: qtyMilliSchema,
  unit: unitSchema,
  unitPrice: nonNegativeMinorUnitsSchema,
  lineTotal: nonNegativeMinorUnitsSchema,
  /** Order of the line on the invoice, starting at 0. */
  position: z.int().min(0),
});
export type InvoiceItem = z.infer<typeof invoiceItemSchema>;

export const paymentSchema = z.strictObject({
  ...appendOnlyColumns,
  customerId: idSchema,
  amount: positiveMinorUnitsSchema,
  date: epochMsSchema,
  note: z.string().trim().max(LIMITS.notes).nullable(),
  invoiceId: idSchema.nullable(),
});
export type Payment = z.infer<typeof paymentSchema>;

export const ledgerEntrySchema = z.strictObject({
  ...appendOnlyColumns,
  customerId: idSchema,
  type: z.enum(LEDGER_ENTRY_TYPES),
  /** Signed: positive increases what the customer owes, negative reduces it. */
  amount: minorUnitsSchema,
  /** The invoice, payment or revision this entry was created for. */
  refId: idSchema,
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

export const invoiceRevisionSchema = z.strictObject({
  ...appendOnlyColumns,
  invoiceId: idSchema,
  /** JSON snapshot of the invoice and its items before the change. */
  previousJson: z.string().max(200_000),
  reason: z.string().trim().min(1).max(LIMITS.reason),
});
export type InvoiceRevision = z.infer<typeof invoiceRevisionSchema>;
