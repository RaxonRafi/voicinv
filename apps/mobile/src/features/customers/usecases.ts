import {
  changedColumns,
  type CustomerRow,
  deletedColumns,
  newMutableColumns,
  type Orm,
  type WriteContext,
} from '@/core/db';
import {
  cleanName,
  diffAliases,
  DomainError,
  languageOf,
  nameKey,
  normalizePhone,
} from '@/core/utils';
import { LIMITS } from '@/shared';

import {
  findCustomer,
  insertCustomerAliases,
  insertCustomers,
  listCustomerAliases,
  listCustomerIdentities,
  updateCustomer,
  updateCustomerAliases,
} from './repository';
import {
  type ContactToImport,
  type CustomerDetails,
  type CustomerInput,
  customerInputSchema,
  type ImportResult,
} from './types';

// Business rules of the customers feature. Platform-free: runs unchanged in Node tests.

/** Empty text means "no phone"; anything else must be a valid number. */
function parsePhone(text: string): string | null {
  if (text.trim() === '') return null;
  const phone = normalizePhone(text);
  if (phone === null) throw new DomainError('invalidPhone', 'phone');
  return phone;
}

interface Identity {
  id: string;
  name: string;
  phone: string | null;
}

/**
 * Two customers may share a name (there can be two Karims) as long as their phone numbers tell
 * them apart. The same phone number, or the same name with no distinguishing phone, is a
 * duplicate.
 */
function isDuplicate(existing: Identity, name: string, phone: string | null): boolean {
  if (phone !== null && existing.phone === phone) return true;
  return nameKey(existing.name) === nameKey(name) && (phone === null || existing.phone === null);
}

function usefulAliases(name: string, aliases: readonly string[]): string[] {
  const seen = new Set([nameKey(name)]);
  const result: string[] = [];
  for (const alias of aliases) {
    const key = nameKey(alias);
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    result.push(cleanName(alias));
  }
  return result;
}

export async function createCustomer(
  ctx: WriteContext,
  input: CustomerInput,
): Promise<CustomerRow> {
  const data = customerInputSchema.parse(input);
  const name = cleanName(data.name);
  const phone = parsePhone(data.phone);
  return ctx.db.write(async (tx) => {
    const existing = await listCustomerIdentities(tx.orm);
    if (existing.some((row) => isDuplicate(row, name, phone))) {
      throw new DomainError('duplicateName', 'name');
    }
    const row: CustomerRow = {
      ...newMutableColumns(ctx),
      name,
      phone,
      notes: data.notes === '' ? null : data.notes,
      creditLimit: data.creditLimit,
      isArchived: false,
    };
    await insertCustomers(tx, [row]);
    await insertCustomerAliases(
      tx,
      usefulAliases(name, data.aliases).map((alias) => ({
        ...newMutableColumns(ctx),
        customerId: row.id,
        alias,
        languageCode: languageOf(alias),
      })),
    );
    return row;
  });
}

export async function editCustomer(
  ctx: WriteContext,
  id: string,
  input: CustomerInput,
): Promise<void> {
  const data = customerInputSchema.parse(input);
  const name = cleanName(data.name);
  const phone = parsePhone(data.phone);
  await ctx.db.write(async (tx) => {
    if (!(await findCustomer(tx.orm, id))) throw new DomainError('notFound');
    const others = (await listCustomerIdentities(tx.orm)).filter((row) => row.id !== id);
    if (others.some((row) => isDuplicate(row, name, phone))) {
      throw new DomainError('duplicateName', 'name');
    }

    await updateCustomer(tx, id, {
      ...changedColumns(ctx),
      name,
      phone,
      notes: data.notes === '' ? null : data.notes,
      creditLimit: data.creditLimit,
    });

    const { removeIds, add } = diffAliases(
      await listCustomerAliases(tx.orm, id),
      usefulAliases(name, data.aliases),
    );
    await updateCustomerAliases(tx, removeIds, deletedColumns(ctx));
    await insertCustomerAliases(
      tx,
      add.map((alias) => ({
        ...newMutableColumns(ctx),
        customerId: id,
        alias,
        languageCode: languageOf(alias),
      })),
    );
  });
}

/** Archived customers are hidden from lists and voice matching; their ledger is kept. */
export async function setCustomerArchived(
  ctx: WriteContext,
  id: string,
  isArchived: boolean,
): Promise<void> {
  await ctx.db.write(async (tx) => {
    if (!(await findCustomer(tx.orm, id))) throw new DomainError('notFound');
    await updateCustomer(tx, id, { ...changedColumns(ctx), isArchived });
  });
}

export async function getCustomerDetails(orm: Orm, id: string): Promise<CustomerDetails | null> {
  const found = await findCustomer(orm, id);
  if (!found) return null;
  const aliases = await listCustomerAliases(orm, id);
  return { ...found, aliases: aliases.map((row) => row.alias) };
}

/**
 * Adds customers picked from the phone's contacts. Contacts without a usable name and ones
 * that already exist are skipped. Contacts never leave the phone.
 */
export async function importCustomers(
  ctx: WriteContext,
  contacts: readonly ContactToImport[],
): Promise<ImportResult> {
  return ctx.db.write(async (tx) => {
    const known: Identity[] = await listCustomerIdentities(tx.orm);
    const rows: CustomerRow[] = [];
    let skipped = 0;

    for (const contact of contacts) {
      const name = cleanName(contact.name).slice(0, LIMITS.name);
      const phone = contact.phone ? normalizePhone(contact.phone) : null;
      if (name === '' || known.some((row) => isDuplicate(row, name, phone))) {
        skipped += 1;
        continue;
      }
      const row: CustomerRow = {
        ...newMutableColumns(ctx),
        name,
        phone,
        notes: null,
        creditLimit: null,
        isArchived: false,
      };
      rows.push(row);
      known.push({ id: row.id, name, phone });
    }

    await insertCustomers(tx, rows);
    return { added: rows.length, skipped };
  });
}
