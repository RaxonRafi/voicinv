import { type AppContent } from '@/content';

import { type ReportData } from '../data/selectors';
import { type Formatters } from '../format';

// Files the web app hands to the visitor: report spreadsheets and encrypted backups. They are
// built in the browser and saved through its own download; nothing is uploaded.

/** Lets spreadsheet apps detect UTF-8, so Bengali text opens correctly. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/** Quotes one CSV field (RFC 4180): wrapped in quotes, inner quotes doubled. */
export function csvField(value: string): string {
  // A leading = + - @ would make spreadsheet apps run the cell as a formula.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function csvRow(values: readonly string[]): string {
  return values.map(csvField).join(',');
}

/**
 * The report as CSV. Amounts are written as plain decimals without grouping or symbol, so
 * spreadsheet apps read them as numbers; text is in the visitor's language.
 */
export function buildReportCsv(
  report: ReportData,
  periodLabel: string,
  t: AppContent,
  fmt: Formatters,
): string {
  const columns = t.reports.columns;
  const plain = (amount: number) => fmt.moneyInput(amount);
  const rows: string[][] = [
    [t.reports.title],
    [columns.period, periodLabel],
    [],
    [columns.summary],
    [t.reports.totalSales, plain(report.summary.totalSales)],
    [columns.totalPaid, plain(report.summary.totalPaid)],
    [columns.totalDue, plain(report.summary.totalDue)],
    [columns.invoices, String(report.summary.invoiceCount)],
    [],
    [t.reports.topProducts],
    [columns.product, columns.unit, columns.quantity, columns.revenue],
    ...report.topProducts.map((product) => [
      product.name,
      product.unit,
      fmt.quantityInput(product.qtyMilli),
      plain(product.revenue),
    ]),
    [],
    [t.reports.topDebtors],
    [columns.customer, columns.phone, columns.outstanding],
    ...report.topDebtors.map((debtor) => [debtor.name, debtor.phone ?? '', plain(debtor.balance)]),
  ];
  // A byte-order mark lets spreadsheet apps detect UTF-8, so Bengali text opens correctly.
  return `${BYTE_ORDER_MARK}${rows.map(csvRow).join('\r\n')}\r\n`;
}

/** Saves bytes or text as a file through the browser's download. */
export function downloadFile(name: string, content: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before the URL is released.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
