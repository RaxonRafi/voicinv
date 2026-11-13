import {
  corrections,
  customerAliases,
  customers,
  invoiceItems,
  invoiceRevisions,
  invoices,
  ledgerEntries,
  type Orm,
  payments,
  productAliases,
  products,
  shops,
  type Tx,
} from '@/core/db';

import { type BackupPayload, type BackupTableData } from './types';

export async function exportDatabaseDump(
  orm: Orm,
  shopId: string,
  deviceId: string,
  now = Date.now(),
): Promise<BackupPayload> {
  const [
    allShops,
    allCustomers,
    allCustomerAliases,
    allProducts,
    allProductAliases,
    allInvoices,
    allInvoiceItems,
    allInvoiceRevisions,
    allPayments,
    allLedgerEntries,
    allCorrections,
  ] = await Promise.all([
    orm.select().from(shops),
    orm.select().from(customers),
    orm.select().from(customerAliases),
    orm.select().from(products),
    orm.select().from(productAliases),
    orm.select().from(invoices),
    orm.select().from(invoiceItems),
    orm.select().from(invoiceRevisions),
    orm.select().from(payments),
    orm.select().from(ledgerEntries),
    orm.select().from(corrections),
  ]);

  const tables: BackupTableData = {
    shops: allShops,
    customers: allCustomers,
    customerAliases: allCustomerAliases,
    products: allProducts,
    productAliases: allProductAliases,
    invoices: allInvoices,
    invoiceItems: allInvoiceItems,
    invoiceRevisions: allInvoiceRevisions,
    payments: allPayments,
    ledgerEntries: allLedgerEntries,
    corrections: allCorrections,
  };

  return {
    version: 1,
    exportedAt: now,
    shopId,
    deviceId,
    tables,
  };
}

/**
 * Runs `work` with the append-only DELETE guards lifted. Only a full restore needs this: it
 * replaces the whole history with the backup's, which the user confirmed. Triggers are
 * re-created from their exact stored definitions in the same transaction, so on any failure
 * the rollback brings the guards back too. UPDATE guards stay in place throughout.
 */
async function withoutDeleteGuards(tx: Tx, work: () => Promise<void>): Promise<void> {
  const guards = await tx.execute(
    `SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name LIKE '%\\_no\\_delete' ESCAPE '\\'`,
  );
  for (const [name] of guards) await tx.execute(`DROP TRIGGER "${String(name)}"`);
  await work();
  for (const [, definition] of guards) await tx.execute(String(definition));
}

export async function clearAllTables(tx: Tx): Promise<void> {
  await withoutDeleteGuards(tx, () => deleteEverything(tx));
}

async function deleteEverything(tx: Tx): Promise<void> {
  // Clear in child-to-parent order to respect referential integrity
  await tx.orm.delete(invoiceRevisions);
  await tx.orm.delete(invoiceItems);
  await tx.orm.delete(invoices);
  await tx.orm.delete(ledgerEntries);
  await tx.orm.delete(payments);
  await tx.orm.delete(productAliases);
  await tx.orm.delete(products);
  await tx.orm.delete(customerAliases);
  await tx.orm.delete(customers);
  await tx.orm.delete(corrections);
  await tx.orm.delete(shops);
}

export async function restoreDatabaseDump(tx: Tx, payload: BackupPayload): Promise<void> {
  await clearAllTables(tx);

  const { tables } = payload;

  if (tables.shops.length > 0) await tx.orm.insert(shops).values(tables.shops);
  if (tables.customers.length > 0) await tx.orm.insert(customers).values(tables.customers);
  if (tables.customerAliases.length > 0) {
    await tx.orm.insert(customerAliases).values(tables.customerAliases);
  }
  if (tables.products.length > 0) await tx.orm.insert(products).values(tables.products);
  if (tables.productAliases.length > 0) {
    await tx.orm.insert(productAliases).values(tables.productAliases);
  }
  if (tables.invoices.length > 0) await tx.orm.insert(invoices).values(tables.invoices);
  if (tables.invoiceItems.length > 0) await tx.orm.insert(invoiceItems).values(tables.invoiceItems);
  if (tables.invoiceRevisions.length > 0) {
    await tx.orm.insert(invoiceRevisions).values(tables.invoiceRevisions);
  }
  if (tables.payments.length > 0) await tx.orm.insert(payments).values(tables.payments);
  if (tables.ledgerEntries.length > 0) {
    await tx.orm.insert(ledgerEntries).values(tables.ledgerEntries);
  }
  if (tables.corrections.length > 0) {
    await tx.orm.insert(corrections).values(tables.corrections);
  }

  tx.touch(
    'shops',
    'customers',
    'customerAliases',
    'products',
    'productAliases',
    'invoices',
    'invoiceItems',
    'invoiceRevisions',
    'payments',
    'ledgerEntries',
    'corrections',
  );
}
