import { and, eq, gte, isNull, lte } from 'drizzle-orm';

import { customers, invoiceItems, invoices, ledgerEntries, type Orm } from '@/core/db';
import { type MinorUnits } from '@/shared';

import { type SalesSummary, type TopDebtor, type TopProduct } from './types';

export async function getSalesSummary(orm: Orm, start: number, end: number): Promise<SalesSummary> {
  const rows = await orm
    .select({
      total: invoices.total,
      paidAmount: invoices.paidAmount,
      dueAmount: invoices.dueAmount,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.status, 'ACTIVE'),
        isNull(invoices.deletedAt),
        gte(invoices.createdAt, start),
        lte(invoices.createdAt, end),
      ),
    );

  let totalSales = 0;
  let totalPaid = 0;
  let totalDue = 0;

  for (const row of rows) {
    totalSales += row.total;
    totalPaid += row.paidAmount;
    totalDue += row.dueAmount;
  }

  return {
    totalSales,
    totalPaid,
    totalDue,
    invoiceCount: rows.length,
  };
}

export async function getTopProducts(
  orm: Orm,
  start: number,
  end: number,
  limit = 5,
): Promise<TopProduct[]> {
  const rows = await orm
    .select({
      name: invoiceItems.nameSnapshot,
      unit: invoiceItems.unit,
      qtyMilli: invoiceItems.qtyMilli,
      lineTotal: invoiceItems.lineTotal,
    })
    .from(invoiceItems)
    .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
    .where(
      and(
        eq(invoices.status, 'ACTIVE'),
        isNull(invoices.deletedAt),
        isNull(invoiceItems.deletedAt),
        gte(invoices.createdAt, start),
        lte(invoices.createdAt, end),
      ),
    );

  const productMap = new Map<
    string,
    { name: string; unit: string; qtyMilli: number; revenue: MinorUnits }
  >();

  for (const row of rows) {
    const key = `${row.name.toLowerCase()}:::${row.unit.toLowerCase()}`;
    const existing = productMap.get(key);
    if (existing) {
      existing.qtyMilli += row.qtyMilli;
      existing.revenue += row.lineTotal;
    } else {
      productMap.set(key, {
        name: row.name,
        unit: row.unit,
        qtyMilli: row.qtyMilli,
        revenue: row.lineTotal,
      });
    }
  }

  return Array.from(productMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export async function getTopDebtors(orm: Orm, limit = 5): Promise<TopDebtor[]> {
  const [customerRows, ledgerRows] = await Promise.all([
    orm
      .select({ id: customers.id, name: customers.name, phone: customers.phone })
      .from(customers)
      .where(and(isNull(customers.deletedAt), eq(customers.isArchived, false))),
    orm
      .select({ customerId: ledgerEntries.customerId, amount: ledgerEntries.amount })
      .from(ledgerEntries),
  ]);

  const balanceMap = new Map<string, MinorUnits>();
  for (const row of ledgerRows) {
    const current = balanceMap.get(row.customerId) ?? 0;
    balanceMap.set(row.customerId, current + row.amount);
  }

  const debtors: TopDebtor[] = [];
  for (const customer of customerRows) {
    const balance = balanceMap.get(customer.id) ?? 0;
    if (balance > 0) {
      debtors.push({
        customerId: customer.id,
        name: customer.name,
        phone: customer.phone,
        balance,
      });
    }
  }

  return debtors.sort((a, b) => b.balance - a.balance).slice(0, limit);
}
