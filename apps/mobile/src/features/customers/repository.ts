import { and, asc, eq, inArray, isNull, like, or, sql } from 'drizzle-orm';

import { customerAliases, type CustomerRow, customers, type Orm, type Tx } from '@/core/db';

import { type CustomerWithBalance } from './types';

// All database access of the customers feature. Balances are read (never written) from the
// ledger: a balance is always the sum of the customer's ledger entries (AGENTS.md §8.3).

// Written with explicit table names: Drizzle omits qualifiers in single-table selects, which
// would make a correlated subquery compare the ledger table's own columns.
const balanceOf = sql<number>`coalesce((
  select sum(entry.amount) from ledger_entries entry
  where entry.customer_id = customers.id
), 0)`;

export interface CustomerFilter {
  /** Matches the name, the phone number or any alias. */
  search?: string;
  includeArchived?: boolean;
}

export async function listCustomers(
  orm: Orm,
  filter: CustomerFilter = {},
): Promise<CustomerWithBalance[]> {
  const term = filter.search?.trim();
  const pattern = term ? `%${term}%` : undefined;
  const matchingAlias = pattern
    ? orm
        .select({ id: customerAliases.customerId })
        .from(customerAliases)
        .where(and(isNull(customerAliases.deletedAt), like(customerAliases.alias, pattern)))
    : undefined;

  return orm
    .select({ customer: customers, balance: balanceOf })
    .from(customers)
    .where(
      and(
        isNull(customers.deletedAt),
        filter.includeArchived ? undefined : eq(customers.isArchived, false),
        pattern && matchingAlias
          ? or(
              like(customers.name, pattern),
              like(customers.phone, pattern),
              inArray(customers.id, matchingAlias),
            )
          : undefined,
      ),
    )
    .orderBy(asc(customers.name));
}

export async function findCustomer(orm: Orm, id: string): Promise<CustomerWithBalance | null> {
  const rows = await orm
    .select({ customer: customers, balance: balanceOf })
    .from(customers)
    .where(and(eq(customers.id, id), isNull(customers.deletedAt)));
  return rows[0] ?? null;
}

/** Name and phone of every live customer, for duplicate checks. */
export async function listCustomerIdentities(
  orm: Orm,
): Promise<{ id: string; name: string; phone: string | null }[]> {
  return orm
    .select({ id: customers.id, name: customers.name, phone: customers.phone })
    .from(customers)
    .where(isNull(customers.deletedAt));
}

export async function listCustomerAliases(
  orm: Orm,
  customerId: string,
): Promise<{ id: string; alias: string }[]> {
  return orm
    .select({ id: customerAliases.id, alias: customerAliases.alias })
    .from(customerAliases)
    .where(and(eq(customerAliases.customerId, customerId), isNull(customerAliases.deletedAt)))
    .orderBy(asc(customerAliases.createdAt));
}

export async function insertCustomers(tx: Tx, rows: CustomerRow[]): Promise<void> {
  if (rows.length === 0) return;
  await tx.orm.insert(customers).values(rows);
  tx.touch('customers');
}

export async function updateCustomer(
  tx: Tx,
  id: string,
  changes: Partial<typeof customers.$inferInsert>,
): Promise<void> {
  await tx.orm.update(customers).set(changes).where(eq(customers.id, id));
  tx.touch('customers');
}

export async function insertCustomerAliases(
  tx: Tx,
  rows: (typeof customerAliases.$inferInsert)[],
): Promise<void> {
  if (rows.length === 0) return;
  await tx.orm.insert(customerAliases).values(rows);
  tx.touch('customerAliases');
}

export async function updateCustomerAliases(
  tx: Tx,
  ids: readonly string[],
  changes: Partial<typeof customerAliases.$inferInsert>,
): Promise<void> {
  if (ids.length === 0) return;
  await tx.orm
    .update(customerAliases)
    .set(changes)
    .where(inArray(customerAliases.id, [...ids]));
  tx.touch('customerAliases');
}
