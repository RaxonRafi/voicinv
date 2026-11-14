import { z } from 'zod';

import { type Customer, LIMITS, type Product } from '@/domain';

import {
  findCustomer,
  findProduct,
  listCustomerAliases,
  listProductAliases,
} from './selectors';
import {
  ChangeSet,
  changedColumns,
  deletedColumns,
  DomainError,
  newMutableColumns,
  type ShopData,
  type WriteContext,
} from './shop-data';
import {
  cleanName,
  diffAliases,
  languageOf,
  nameKey,
  normalizePhone,
  usefulAliases,
} from './text';

// Customers and products: what the shop sells and to whom. Same rules as on the phone.

/** What the shopkeeper enters for a customer. Messages are form error codes. */
export const customerInputSchema = z.object({
  name: z.string().trim().min(1, 'required').max(LIMITS.name, 'tooLong'),
  /** As typed; may be empty. Normalized and validated by the use case. */
  phone: z.string().max(40, 'invalidPhone'),
  notes: z.string().trim().max(LIMITS.notes, 'tooLong'),
  /** Most the customer may owe, in minor units. Null = no limit. */
  creditLimit: z.int('invalidAmount').min(0, 'invalidAmount').nullable(),
  /** Other names or spellings, in any language; used to match spoken sales. */
  aliases: z.array(z.string().trim().min(1).max(LIMITS.alias)).max(20),
});
export type CustomerInput = z.infer<typeof customerInputSchema>;

/** Empty text means "no phone"; anything else must be a valid number. */
function parsePhone(text: string): string | null {
  if (text.trim() === '') return null;
  const phone = normalizePhone(text);
  if (phone === null) throw new DomainError('invalidPhone', 'phone');
  return phone;
}

/**
 * Two customers may share a name (there can be two Karims) as long as their phone numbers tell
 * them apart. The same phone number, or the same name with no distinguishing phone, is a
 * duplicate.
 */
function isDuplicateCustomer(existing: Customer, name: string, phone: string | null): boolean {
  if (phone !== null && existing.phone === phone) return true;
  return nameKey(existing.name) === nameKey(name) && (phone === null || existing.phone === null);
}

function assertCustomerIsNew(
  data: ShopData,
  name: string,
  phone: string | null,
  exceptId?: string,
): void {
  for (const existing of data.customers.values()) {
    if (existing.deletedAt !== null || existing.id === exceptId) continue;
    if (isDuplicateCustomer(existing, name, phone)) throw new DomainError('duplicateName', 'name');
  }
}

export function createCustomer(
  data: ShopData,
  ctx: WriteContext,
  input: CustomerInput,
): { changes: ChangeSet; result: Customer } {
  const parsed = customerInputSchema.parse(input);
  const name = cleanName(parsed.name);
  const phone = parsePhone(parsed.phone);
  assertCustomerIsNew(data, name, phone);

  const customer: Customer = {
    ...newMutableColumns(ctx),
    name,
    phone,
    notes: parsed.notes === '' ? null : parsed.notes,
    creditLimit: parsed.creditLimit,
    isArchived: false,
  };
  const changes = new ChangeSet().put('customers', customer);
  for (const alias of usefulAliases(name, parsed.aliases)) {
    changes.put('customerAliases', {
      ...newMutableColumns(ctx),
      customerId: customer.id,
      alias,
      languageCode: languageOf(alias),
    });
  }
  return { changes, result: customer };
}

export function editCustomer(
  data: ShopData,
  ctx: WriteContext,
  id: string,
  input: CustomerInput & { isArchived?: boolean },
): { changes: ChangeSet; result: Customer } {
  const parsed = customerInputSchema.parse(input);
  const name = cleanName(parsed.name);
  const phone = parsePhone(parsed.phone);
  const found = findCustomer(data, id);
  if (!found) throw new DomainError('notFound');
  assertCustomerIsNew(data, name, phone, id);

  const customer: Customer = {
    ...found.customer,
    ...changedColumns(ctx),
    name,
    phone,
    notes: parsed.notes === '' ? null : parsed.notes,
    creditLimit: parsed.creditLimit,
    isArchived: input.isArchived ?? found.customer.isArchived,
  };
  const changes = new ChangeSet().put('customers', customer);

  const { removeIds, add } = diffAliases(
    listCustomerAliases(data, id),
    usefulAliases(name, parsed.aliases),
  );
  for (const aliasId of removeIds) {
    const alias = data.customerAliases.get(aliasId);
    if (alias) changes.put('customerAliases', { ...alias, ...deletedColumns(ctx) });
  }
  for (const alias of add) {
    changes.put('customerAliases', {
      ...newMutableColumns(ctx),
      customerId: id,
      alias,
      languageCode: languageOf(alias),
    });
  }
  return { changes, result: customer };
}

/** What the shopkeeper enters for a product. */
export const productInputSchema = z.object({
  name: z.string().trim().min(1, 'required').max(LIMITS.name, 'tooLong'),
  unit: z.string().trim().min(1, 'required').max(LIMITS.unit, 'tooLong'),
  /** Usual price in minor units, or null when the price is asked per sale. */
  defaultPrice: z.int('invalidAmount').min(0, 'invalidAmount').nullable(),
  /** Other names the product is called by, in any language. */
  aliases: z.array(z.string().trim().min(1).max(LIMITS.alias)).max(20),
});
export type ProductInput = z.infer<typeof productInputSchema>;

function assertProductNameIsFree(data: ShopData, name: string, exceptId?: string): void {
  const key = nameKey(name);
  for (const existing of data.products.values()) {
    if (existing.deletedAt !== null || existing.id === exceptId) continue;
    if (nameKey(existing.name) === key) throw new DomainError('duplicateName', 'name');
  }
}

export function createProduct(
  data: ShopData,
  ctx: WriteContext,
  input: ProductInput,
): { changes: ChangeSet; result: Product } {
  const parsed = productInputSchema.parse(input);
  const name = cleanName(parsed.name);
  assertProductNameIsFree(data, name);

  const product: Product = {
    ...newMutableColumns(ctx),
    name,
    unit: cleanName(parsed.unit),
    defaultPrice: parsed.defaultPrice,
    stockQty: null,
    isArchived: false,
  };
  const changes = new ChangeSet().put('products', product);
  for (const alias of usefulAliases(name, parsed.aliases)) {
    changes.put('productAliases', {
      ...newMutableColumns(ctx),
      productId: product.id,
      alias,
      languageCode: languageOf(alias),
    });
  }
  return { changes, result: product };
}

export function editProduct(
  data: ShopData,
  ctx: WriteContext,
  id: string,
  input: ProductInput & { isArchived?: boolean },
): { changes: ChangeSet; result: Product } {
  const parsed = productInputSchema.parse(input);
  const name = cleanName(parsed.name);
  const existing = findProduct(data, id);
  if (!existing) throw new DomainError('notFound');
  assertProductNameIsFree(data, name, id);

  const product: Product = {
    ...existing,
    ...changedColumns(ctx),
    name,
    unit: cleanName(parsed.unit),
    defaultPrice: parsed.defaultPrice,
    isArchived: input.isArchived ?? existing.isArchived,
  };
  const changes = new ChangeSet().put('products', product);

  const { removeIds, add } = diffAliases(
    listProductAliases(data, id),
    usefulAliases(name, parsed.aliases),
  );
  for (const aliasId of removeIds) {
    const alias = data.productAliases.get(aliasId);
    if (alias) changes.put('productAliases', { ...alias, ...deletedColumns(ctx) });
  }
  for (const alias of add) {
    changes.put('productAliases', {
      ...newMutableColumns(ctx),
      productId: id,
      alias,
      languageCode: languageOf(alias),
    });
  }
  return { changes, result: product };
}
