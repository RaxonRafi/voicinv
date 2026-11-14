import { type ReactNode } from 'react';

import { type AppContent } from '@/content';
import { Money, type Shop } from '@/domain';
import { fill } from '@/lib/format';
import { type Locale } from '@/lib/locales';

import {
  type InvoiceBadgeStatus,
  type InvoiceDetails,
  type ReportData,
  type StatementLine,
} from '../data/selectors';
import { type Formatters } from '../format';
import { type PageFormat } from './print';

// Printable documents: invoices, customer statements and reports. Plain markup styled with the
// design tokens (always the light theme on paper), rendered into the print area.

export function statusLabel(status: InvoiceBadgeStatus, t: AppContent): string {
  switch (status) {
    case 'PAID':
      return t.status.paid;
    case 'PARTLY_PAID':
      return t.status.partlyPaid;
    case 'DUE':
      return t.status.due;
    case 'CANCELLED':
      return t.status.cancelled;
  }
}

interface PageProps {
  locale: Locale;
  narrow: boolean;
  children: ReactNode;
}

function Page({ locale, narrow, children }: PageProps) {
  return (
    <article
      lang={locale}
      className={narrow ? 'flex flex-col gap-2 text-caption' : 'flex flex-col gap-4 text-body'}
    >
      {children}
    </article>
  );
}

function ShopHeading({ shop, narrow }: { shop: Shop; narrow: boolean }) {
  return (
    <header className={narrow ? 'flex flex-col items-center text-center' : 'flex flex-col'}>
      <p className={narrow ? 'text-body-strong' : 'text-title'}>{shop.name}</p>
      {shop.address ? <p className="text-text-secondary">{shop.address}</p> : null}
      {shop.phone ? <p className="text-text-secondary">{shop.phone}</p> : null}
    </header>
  );
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'paid' | 'due';
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className={strong ? 'font-semibold' : 'text-text-secondary'}>{label}</span>
      <span
        className={[
          'tabular-nums whitespace-nowrap',
          strong ? 'font-semibold' : '',
          tone === 'paid' ? 'text-money-paid' : tone === 'due' ? 'text-money-due' : '',
        ].join(' ')}
      >
        {value}
      </span>
    </div>
  );
}

const RULE = 'border-t border-border-default';

interface InvoiceDocumentProps {
  details: InvoiceDetails;
  shop: Shop;
  format: PageFormat;
  t: AppContent;
  fmt: Formatters;
  /** Free plan: a small "Made with VoiceLedger" line (AGENTS.md §11). */
  watermark: boolean;
}

/** One template for A4 and for 58 mm / 80 mm receipts. */
export function InvoiceDocument({
  details,
  shop,
  format,
  t,
  fmt,
  watermark,
}: InvoiceDocumentProps) {
  const { invoice, items, customerName, status } = details;
  const narrow = format !== 'a4';
  const cancelled = invoice.status === 'CANCELLED';
  const labels = t.invoices.document;

  return (
    <Page locale={fmt.locale} narrow={narrow}>
      <ShopHeading shop={shop} narrow={narrow} />
      <div className={`${RULE} flex flex-col gap-1 pt-2`}>
        <Row label={t.invoices.invoice} value={invoice.invoiceNumber} strong />
        <Row label={t.invoices.date} value={fmt.dateTime(invoice.date)} />
        <Row label={t.invoices.customer} value={customerName ?? t.common.walkIn} />
        <p className="self-start rounded-full border border-current px-2 font-semibold">
          {statusLabel(status, t)}
        </p>
      </div>

      <table
        className={`w-full border-collapse ${cancelled ? 'line-through text-money-cancelled' : ''}`}
      >
        <thead>
          <tr className={`${RULE} text-left text-text-secondary`}>
            <th className="py-1 font-semibold">{labels.item}</th>
            {narrow ? null : <th className="py-1 text-right font-semibold">{labels.quantity}</th>}
            {narrow ? null : <th className="py-1 text-right font-semibold">{labels.price}</th>}
            <th className="py-1 text-right font-semibold">{labels.amount}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className={RULE}>
              <td className="py-1 align-top">
                {item.nameSnapshot}
                {narrow ? (
                  <span className="block text-text-secondary">
                    {fmt.quantity(item.qtyMilli)} {item.unit} × {fmt.amount(item.unitPrice)}
                  </span>
                ) : null}
              </td>
              {narrow ? null : (
                <td className="py-1 text-right align-top tabular-nums">
                  {fmt.quantity(item.qtyMilli)} {item.unit}
                </td>
              )}
              {narrow ? null : (
                <td className="py-1 text-right align-top tabular-nums">
                  {fmt.amount(item.unitPrice)}
                </td>
              )}
              <td className="py-1 text-right align-top tabular-nums">
                {fmt.amount(item.lineTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={`${RULE} flex flex-col gap-1 pt-2 ${narrow ? '' : 'ml-auto w-1/2'}`}>
        <Row label={t.invoices.subtotal} value={fmt.money(invoice.subtotal)} />
        {invoice.discount > 0 ? (
          <Row label={t.invoices.discount} value={`-${fmt.money(invoice.discount)}`} />
        ) : null}
        <Row label={t.invoices.total} value={fmt.money(invoice.total)} strong />
        <Row label={t.invoices.paid} value={fmt.money(invoice.paidAmount)} tone="paid" />
        {details.settledLater > 0 ? (
          <Row label={t.invoices.paidLater} value={fmt.money(details.settledLater)} tone="paid" />
        ) : null}
        <Row
          label={t.invoices.due}
          value={fmt.money(Money.max(0, Money.subtract(invoice.dueAmount, details.settledLater)))}
          tone="due"
          strong
        />
      </div>
      {watermark ? (
        <p className="pt-4 text-center text-text-secondary">{labels.watermark}</p>
      ) : null}
    </Page>
  );
}

interface StatementDocumentProps {
  shop: Shop;
  customerName: string;
  lines: readonly StatementLine[];
  t: AppContent;
  fmt: Formatters;
  now: number;
}

/** A customer's ledger, oldest entry first, with the running balance. */
export function StatementDocument({
  shop,
  customerName,
  lines,
  t,
  fmt,
  now,
}: StatementDocumentProps) {
  const labels = t.ledger.statement;
  const closing = lines.at(-1)?.balance ?? 0;
  return (
    <Page locale={fmt.locale} narrow={false}>
      <ShopHeading shop={shop} narrow={false} />
      <div className={`${RULE} pt-2`}>
        <p className="text-heading">{fill(labels.title, { name: customerName })}</p>
        <p className="text-text-secondary">
          {fill(t.reports.generatedAt, { date: fmt.dateTime(now) })}
        </p>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className={`${RULE} text-left text-text-secondary`}>
            <th className="py-1 font-semibold">{labels.date}</th>
            <th className="py-1 font-semibold">{labels.description}</th>
            <th className="py-1 text-right font-semibold">{labels.amount}</th>
            <th className="py-1 text-right font-semibold">{labels.balance}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map(({ entry, invoiceNumber, balance }) => (
            <tr key={entry.id} className={RULE}>
              <td className="py-1 tabular-nums">{fmt.date(entry.createdAt)}</td>
              <td className="py-1">
                {t.ledger.entries[entry.type]}
                {invoiceNumber ? (
                  <span className="text-text-secondary"> · {invoiceNumber}</span>
                ) : null}
              </td>
              <td className="py-1 text-right tabular-nums">{fmt.money(entry.amount)}</td>
              <td className="py-1 text-right tabular-nums">{fmt.money(balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={`${RULE} ml-auto w-1/2 pt-2`}>
        <Row
          label={labels.closing}
          value={fmt.money(closing)}
          strong
          tone={closing > 0 ? 'due' : 'paid'}
        />
      </div>
    </Page>
  );
}

interface ReportDocumentProps {
  shop: Shop;
  report: ReportData;
  periodLabel: string;
  t: AppContent;
  fmt: Formatters;
  now: number;
}

export function ReportDocument({ shop, report, periodLabel, t, fmt, now }: ReportDocumentProps) {
  const columns = t.reports.columns;
  return (
    <Page locale={fmt.locale} narrow={false}>
      <ShopHeading shop={shop} narrow={false} />
      <div className={`${RULE} pt-2`}>
        <p className="text-heading">
          {t.reports.title} · {periodLabel}
        </p>
        <p className="text-text-secondary">
          {fill(t.reports.generatedAt, { date: fmt.dateTime(now) })}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <Row label={t.reports.totalSales} value={fmt.money(report.summary.totalSales)} strong />
        <Row label={columns.totalPaid} value={fmt.money(report.summary.totalPaid)} tone="paid" />
        <Row label={columns.totalDue} value={fmt.money(report.summary.totalDue)} tone="due" />
        <Row label={columns.invoices} value={fmt.integer(report.summary.invoiceCount)} />
      </div>
      <p className="pt-2 text-heading">{t.reports.topProducts}</p>
      <table className="w-full border-collapse">
        <thead>
          <tr className={`${RULE} text-left text-text-secondary`}>
            <th className="py-1 font-semibold">{columns.product}</th>
            <th className="py-1 text-right font-semibold">{columns.quantity}</th>
            <th className="py-1 text-right font-semibold">{columns.revenue}</th>
          </tr>
        </thead>
        <tbody>
          {report.topProducts.map((product) => (
            <tr key={`${product.name}|${product.unit}`} className={RULE}>
              <td className="py-1">{product.name}</td>
              <td className="py-1 text-right tabular-nums">
                {fmt.quantity(product.qtyMilli)} {product.unit}
              </td>
              <td className="py-1 text-right tabular-nums">{fmt.money(product.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pt-2 text-heading">{t.reports.topDebtors}</p>
      <table className="w-full border-collapse">
        <thead>
          <tr className={`${RULE} text-left text-text-secondary`}>
            <th className="py-1 font-semibold">{columns.customer}</th>
            <th className="py-1 font-semibold">{columns.phone}</th>
            <th className="py-1 text-right font-semibold">{columns.outstanding}</th>
          </tr>
        </thead>
        <tbody>
          {report.topDebtors.map((debtor) => (
            <tr key={debtor.customerId} className={RULE}>
              <td className="py-1">{debtor.name}</td>
              <td className="py-1 tabular-nums">{debtor.phone ?? ''}</td>
              <td className="py-1 text-right tabular-nums text-money-due">
                {fmt.money(debtor.balance)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Page>
  );
}
