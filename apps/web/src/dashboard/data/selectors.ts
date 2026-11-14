import {
  type Customer,
  type Invoice,
  type InvoiceItem,
  type InvoiceRevision,
  type LedgerEntry,
  type MinorUnits,
  Money,
  parseInvoiceNumber,
  type PaymentStatus,
  paymentStatus,
  type Product,
  type Shop,
} from '@/domain';

import { type ShopData } from './shop-data';
import { nameKey } from './text';

// Read side of the web app: every list and total the screens show, derived from the synced
// records. Pure functions with the same rules as the mobile app's repositories and use cases
// (AGENTS.md §8.3): balances are sums of ledger entries, nothing is cached.

function live<T extends { deletedAt: number | null }>(records: Iterable<T>): T[] {
  const result: T[] = [];
  for (const record of records) if (record.deletedAt === null) result.push(record);
  return result;
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/** The shop's profile, or null before the first record arrives. */
export function getShop(data: ShopData): Shop | null {
  return live(data.shops.values())[0] ?? null;
}

// ── Customers and the ledger ────────────────────────────────────────────────────────────────

/** Balance of every customer with ledger entries: positive = owes the shop. */
export function customerBalances(data: ShopData): Map<string, MinorUnits> {
  const balances = new Map<string, MinorUnits>();
  for (const entry of data.ledgerEntries.values()) {
    balances.set(entry.customerId, Money.add(balances.get(entry.customerId) ?? 0, entry.amount));
  }
  return balances;
}

export interface CustomerWithBalance {
  customer: Customer;
  /** What the customer owes; negative when they have paid in advance. */
  balance: MinorUnits;
}

export interface ListFilter {
  includeArchived?: boolean;
  search?: string;
}

/** Customers by name, matching the search against name, phone and other names. */
export function listCustomers(data: ShopData, filter: ListFilter = {}): CustomerWithBalance[] {
  const term = nameKey(filter.search ?? '');
  const aliasMatches = new Set<string>();
  if (term !== '') {
    for (const alias of live(data.customerAliases.values())) {
      if (nameKey(alias.alias).includes(term)) aliasMatches.add(alias.customerId);
    }
  }
  const balances = customerBalances(data);
  return live(data.customers.values())
    .filter((customer) => filter.includeArchived || !customer.isArchived)
    .filter(
      (customer) =>
        term === '' ||
        nameKey(customer.name).includes(term) ||
        (customer.phone ?? '').includes(term) ||
        aliasMatches.has(customer.id),
    )
    .sort(byName)
    .map((customer) => ({ customer, balance: balances.get(customer.id) ?? 0 }));
}

export function findCustomer(data: ShopData, id: string): CustomerWithBalance | null {
  const customer = data.customers.get(id);
  if (!customer || customer.deletedAt !== null) return null;
  return { customer, balance: customerBalances(data).get(id) ?? 0 };
}

export function listCustomerAliases(
  data: ShopData,
  customerId: string,
): { id: string; alias: string }[] {
  return live(data.customerAliases.values())
    .filter((alias) => alias.customerId === customerId)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .map(({ id, alias }) => ({ id, alias }));
}

/** Money owed to the shop, and money customers have paid ahead. */
export function receivables(data: ShopData): { toCollect: MinorUnits; advanceHeld: MinorUnits } {
  let toCollect = 0;
  let advanceHeld = 0;
  for (const balance of customerBalances(data).values()) {
    if (balance > 0) toCollect = Money.add(toCollect, balance);
    else advanceHeld = Money.add(advanceHeld, Money.negate(balance));
  }
  return { toCollect, advanceHeld };
}

export interface StatementLine {
  entry: LedgerEntry;
  /** Number of the invoice the entry refers to; null for payments. */
  invoiceNumber: string | null;
  /** Balance right after this entry. */
  balance: MinorUnits;
}

/** A customer's entries, oldest first, each with the running balance. */
export function getStatement(data: ShopData, customerId: string): StatementLine[] {
  let balance = 0;
  return [...data.ledgerEntries.values()]
    .filter((entry) => entry.customerId === customerId)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .map((entry) => {
      balance = Money.add(balance, entry.amount);
      return {
        entry,
        invoiceNumber: data.invoices.get(entry.refId)?.invoiceNumber ?? null,
        balance,
      };
    });
}

export type CreditStatus = 'none' | 'within' | 'over';

/** Whether a balance has passed the customer's credit limit. No limit means no warning. */
export function creditStatus(balance: MinorUnits, creditLimit: MinorUnits | null): CreditStatus {
  if (creditLimit === null) return 'none';
  return balance > creditLimit ? 'over' : 'within';
}

// ── Products ────────────────────────────────────────────────────────────────────────────────

export function listProducts(data: ShopData, filter: ListFilter = {}): Product[] {
  const term = nameKey(filter.search ?? '');
  const aliasMatches = new Set<string>();
  if (term !== '') {
    for (const alias of live(data.productAliases.values())) {
      if (nameKey(alias.alias).includes(term)) aliasMatches.add(alias.productId);
    }
  }
  return live(data.products.values())
    .filter((product) => filter.includeArchived || !product.isArchived)
    .filter(
      (product) =>
        term === '' || nameKey(product.name).includes(term) || aliasMatches.has(product.id),
    )
    .sort(byName);
}

export function findProduct(data: ShopData, id: string): Product | null {
  const product = data.products.get(id);
  return product && product.deletedAt === null ? product : null;
}

export function listProductAliases(
  data: ShopData,
  productId: string,
): { id: string; alias: string }[] {
  return live(data.productAliases.values())
    .filter((alias) => alias.productId === productId)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .map(({ id, alias }) => ({ id, alias }));
}

// ── Invoices ────────────────────────────────────────────────────────────────────────────────

export interface OpenInvoice {
  id: string;
  /** Used for first-in-first-out order. */
  date: number;
  /** What was left unpaid at the time of sale (after later edits). */
  dueAmount: MinorUnits;
}

export interface PaymentForAllocation {
  amount: MinorUnits;
  /** Invoice the customer named when paying, if any. */
  invoiceId: string | null;
}

/**
 * Works out how much of each invoice's due amount has been settled by later payments.
 * Payments made for a specific invoice go to it first; everything else settles the oldest
 * invoices first. Derived on demand, never stored: the ledger entries stay the only truth.
 */
export function allocatePayments(
  invoices: readonly OpenInvoice[],
  paymentsMade: readonly PaymentForAllocation[],
): Map<string, MinorUnits> {
  const settled = new Map<string, MinorUnits>(invoices.map((invoice) => [invoice.id, 0]));
  const dueOf = new Map(invoices.map((invoice) => [invoice.id, invoice.dueAmount]));
  let pool = 0;

  for (const payment of paymentsMade) {
    const due = payment.invoiceId === null ? undefined : dueOf.get(payment.invoiceId);
    if (payment.invoiceId === null || due === undefined) {
      pool = Money.add(pool, payment.amount);
      continue;
    }
    const already = settled.get(payment.invoiceId) ?? 0;
    const applied = Money.min(payment.amount, Money.subtract(due, already));
    settled.set(payment.invoiceId, Money.add(already, applied));
    pool = Money.add(pool, Money.subtract(payment.amount, applied));
  }

  const oldestFirst = [...invoices].sort((a, b) => a.date - b.date || a.id.localeCompare(b.id));
  for (const invoice of oldestFirst) {
    if (pool === 0) break;
    const already = settled.get(invoice.id) ?? 0;
    const applied = Money.min(pool, Money.subtract(invoice.dueAmount, already));
    settled.set(invoice.id, Money.add(already, applied));
    pool = Money.subtract(pool, applied);
  }
  return settled;
}

/** Part of each open invoice's due amount settled by payments received after the sale. */
export function settledAmounts(data: ShopData): Map<string, MinorUnits> {
  const openByCustomer = new Map<string, OpenInvoice[]>();
  for (const invoice of live(data.invoices.values())) {
    if (invoice.status !== 'ACTIVE' || invoice.customerId === null || invoice.dueAmount <= 0) {
      continue;
    }
    const list = openByCustomer.get(invoice.customerId) ?? [];
    list.push({ id: invoice.id, date: invoice.date, dueAmount: invoice.dueAmount });
    openByCustomer.set(invoice.customerId, list);
  }
  const paidByCustomer = new Map<string, PaymentForAllocation[]>();
  const oldestFirst = [...data.payments.values()].sort(
    (a, b) => a.date - b.date || a.id.localeCompare(b.id),
  );
  for (const payment of oldestFirst) {
    const list = paidByCustomer.get(payment.customerId) ?? [];
    list.push({ amount: payment.amount, invoiceId: payment.invoiceId });
    paidByCustomer.set(payment.customerId, list);
  }

  const settled = new Map<string, MinorUnits>();
  for (const [customerId, open] of openByCustomer) {
    allocatePayments(open, paidByCustomer.get(customerId) ?? []).forEach((amount, invoiceId) =>
      settled.set(invoiceId, amount),
    );
  }
  return settled;
}

/** What a badge shows for an invoice. */
export type InvoiceBadgeStatus = PaymentStatus | 'CANCELLED';

/** Paid / Partly paid / Due / Cancelled, counting payments received after the sale. */
export function invoiceBadgeStatus(
  invoice: Pick<Invoice, 'status' | 'total' | 'paidAmount'>,
  settledLater: MinorUnits,
): InvoiceBadgeStatus {
  if (invoice.status === 'CANCELLED') return 'CANCELLED';
  return paymentStatus(invoice.total, Money.add(invoice.paidAmount, settledLater));
}

export interface InvoiceListRow {
  invoice: Invoice;
  /** Null for a walk-in sale. */
  customerName: string | null;
  status: InvoiceBadgeStatus;
  /** Part of the due amount settled by payments received after the sale. */
  settledLater: MinorUnits;
}

export interface InvoiceFilter {
  customerId?: string;
  /** Matches the invoice number or the customer's name. */
  search?: string;
  limit?: number;
}

/** Invoices, newest first. */
export function listInvoices(data: ShopData, filter: InvoiceFilter = {}): InvoiceListRow[] {
  const term = nameKey(filter.search ?? '');
  const settled = settledAmounts(data);
  const rows: InvoiceListRow[] = [];
  for (const invoice of live(data.invoices.values())) {
    if (filter.customerId !== undefined && invoice.customerId !== filter.customerId) continue;
    const customerName =
      invoice.customerId === null ? null : (data.customers.get(invoice.customerId)?.name ?? null);
    if (
      term !== '' &&
      !nameKey(invoice.invoiceNumber).includes(term) &&
      !nameKey(customerName ?? '').includes(term)
    ) {
      continue;
    }
    const settledLater = settled.get(invoice.id) ?? 0;
    rows.push({
      invoice,
      customerName,
      settledLater,
      status: invoiceBadgeStatus(invoice, settledLater),
    });
  }
  rows.sort((a, b) => b.invoice.date - a.invoice.date || b.invoice.id.localeCompare(a.invoice.id));
  return filter.limit === undefined ? rows : rows.slice(0, filter.limit);
}

export function listInvoiceItems(data: ShopData, invoiceId: string): InvoiceItem[] {
  return live(data.invoiceItems.values())
    .filter((item) => item.invoiceId === invoiceId)
    .sort((a, b) => a.position - b.position);
}

export interface InvoiceDetails extends InvoiceListRow {
  items: InvoiceItem[];
  revisions: InvoiceRevision[];
}

export function getInvoiceDetails(data: ShopData, id: string): InvoiceDetails | null {
  const invoice = data.invoices.get(id);
  if (!invoice || invoice.deletedAt !== null) return null;
  const settledLater = settledAmounts(data).get(id) ?? 0;
  return {
    invoice,
    customerName:
      invoice.customerId === null ? null : (data.customers.get(invoice.customerId)?.name ?? null),
    settledLater,
    status: invoiceBadgeStatus(invoice, settledLater),
    items: listInvoiceItems(data, id),
    revisions: [...data.invoiceRevisions.values()]
      .filter((revision) => revision.invoiceId === id)
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)),
  };
}

/**
 * The highest sequence number already used with this prefix and device code, or 0. Cancelled
 * and soft-deleted invoices count too: a number is never reused (AGENTS.md §8.4).
 */
export function highestInvoiceSequence(
  data: ShopData,
  shopPrefix: string,
  deviceCode: string,
): number {
  let highest = 0;
  for (const invoice of data.invoices.values()) {
    const parts = parseInvoiceNumber(invoice.invoiceNumber);
    if (parts && parts.shopPrefix === shopPrefix && parts.deviceCode === deviceCode) {
      highest = Math.max(highest, parts.sequence);
    }
  }
  return highest;
}

// ── Reports ─────────────────────────────────────────────────────────────────────────────────

export type ReportPeriod = 'today' | 'week' | 'month';

/** Start and end (inclusive) of the period containing `now`, in the browser's time zone. */
export function calculateDateRange(
  period: ReportPeriod,
  now: number,
): { start: number; end: number } {
  const current = new Date(now);
  const year = current.getFullYear();
  const month = current.getMonth();
  const day = current.getDate();
  const end = new Date(year, month, day, 23, 59, 59, 999).getTime();
  if (period === 'today') return { start: new Date(year, month, day).getTime(), end };
  if (period === 'week') {
    const weekday = current.getDay(); // 0 is Sunday; weeks start on Monday
    const monday = day - weekday + (weekday === 0 ? -6 : 1);
    return { start: new Date(year, month, monday).getTime(), end };
  }
  return { start: new Date(year, month, 1).getTime(), end };
}

export interface SalesSummary {
  totalSales: MinorUnits;
  totalPaid: MinorUnits;
  totalDue: MinorUnits;
  invoiceCount: number;
}

function invoicesBetween(data: ShopData, start: number, end: number): Invoice[] {
  return live(data.invoices.values()).filter(
    (invoice) => invoice.status === 'ACTIVE' && invoice.date >= start && invoice.date <= end,
  );
}

/** Totals of the active invoices dated within `[start, end]`. */
export function getSalesSummary(data: ShopData, start: number, end: number): SalesSummary {
  const invoices = invoicesBetween(data, start, end);
  return {
    totalSales: Money.sum(invoices.map((invoice) => invoice.total)),
    totalPaid: Money.sum(invoices.map((invoice) => invoice.paidAmount)),
    totalDue: Money.sum(invoices.map((invoice) => invoice.dueAmount)),
    invoiceCount: invoices.length,
  };
}

export interface TopProduct {
  name: string;
  unit: string;
  qtyMilli: number;
  revenue: MinorUnits;
}

/** Best-selling items of the period by revenue, grouped by name and unit as sold. */
export function getTopProducts(
  data: ShopData,
  start: number,
  end: number,
  limit = 5,
): TopProduct[] {
  const inPeriod = new Set(invoicesBetween(data, start, end).map((invoice) => invoice.id));
  const totals = new Map<string, TopProduct>();
  for (const item of live(data.invoiceItems.values())) {
    if (!inPeriod.has(item.invoiceId)) continue;
    const key = `${nameKey(item.nameSnapshot)}\u0000${nameKey(item.unit)}`;
    const existing = totals.get(key);
    if (existing) {
      existing.qtyMilli += item.qtyMilli;
      existing.revenue = Money.add(existing.revenue, item.lineTotal);
    } else {
      totals.set(key, {
        name: item.nameSnapshot,
        unit: item.unit,
        qtyMilli: item.qtyMilli,
        revenue: item.lineTotal,
      });
    }
  }
  return [...totals.values()]
    .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export interface TopDebtor {
  customerId: string;
  name: string;
  phone: string | null;
  balance: MinorUnits;
}

/** Customers who owe the most, largest balance first. */
export function getTopDebtors(data: ShopData, limit = 5): TopDebtor[] {
  return listCustomers(data)
    .filter(({ balance }) => balance > 0)
    .sort((a, b) => b.balance - a.balance || byName(a.customer, b.customer))
    .slice(0, limit)
    .map(({ customer, balance }) => ({
      customerId: customer.id,
      name: customer.name,
      phone: customer.phone,
      balance,
    }));
}

export interface ReportData {
  period: ReportPeriod;
  dateRange: { start: number; end: number };
  summary: SalesSummary;
  topProducts: TopProduct[];
  topDebtors: TopDebtor[];
}

export function loadReportData(data: ShopData, period: ReportPeriod, now: number): ReportData {
  const dateRange = calculateDateRange(period, now);
  return {
    period,
    dateRange,
    summary: getSalesSummary(data, dateRange.start, dateRange.end),
    topProducts: getTopProducts(data, dateRange.start, dateRange.end),
    topDebtors: getTopDebtors(data),
  };
}
