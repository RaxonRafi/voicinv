import { type Orm, type ShopRow } from '@/core/db';
import { documentHtml, escapeHtml } from '@/core/documents';
import { htmlToPdf, shareFile, writeCacheFile } from '@/core/platform';
import { type MinorUnits } from '@/shared';

import { getSalesSummary, getTopDebtors, getTopProducts } from './repository';
import { type ReportData, type ReportPeriod } from './types';

export function calculateDateRange(
  period: ReportPeriod,
  now = Date.now(),
): { start: number; end: number } {
  const current = new Date(now);
  const end = new Date(
    current.getFullYear(),
    current.getMonth(),
    current.getDate(),
    23,
    59,
    59,
    999,
  ).getTime();

  let start: number;
  if (period === 'today') {
    start = new Date(
      current.getFullYear(),
      current.getMonth(),
      current.getDate(),
      0,
      0,
      0,
      0,
    ).getTime();
  } else if (period === 'week') {
    const day = current.getDay(); // 0 is Sunday
    const diff = current.getDate() - day + (day === 0 ? -6 : 1); // Monday
    start = new Date(current.getFullYear(), current.getMonth(), diff, 0, 0, 0, 0).getTime();
  } else {
    // month
    start = new Date(current.getFullYear(), current.getMonth(), 1, 0, 0, 0, 0).getTime();
  }

  return { start, end };
}

export async function loadReportData(
  orm: Orm,
  period: ReportPeriod,
  now = Date.now(),
): Promise<ReportData> {
  const dateRange = calculateDateRange(period, now);
  const [summary, topProducts, topDebtors] = await Promise.all([
    getSalesSummary(orm, dateRange.start, dateRange.end),
    getTopProducts(orm, dateRange.start, dateRange.end),
    getTopDebtors(orm),
  ]);

  return {
    period,
    dateRange,
    summary,
    topProducts,
    topDebtors,
  };
}

export function buildReportCsv(
  data: ReportData,
  formatMoney: (m: MinorUnits) => string,
  labels: Record<string, string>,
): string {
  const lines: string[] = [];

  lines.push(`"${labels.title ?? 'Sales Report'}"`);
  lines.push(`"${labels.period ?? 'Period'}","${data.period}"`);
  lines.push('');

  lines.push(`"${labels.summary ?? 'Summary'}"`);
  lines.push(`"${labels.totalSales ?? 'Total Sales'}","${formatMoney(data.summary.totalSales)}"`);
  lines.push(`"${labels.totalPaid ?? 'Total Paid'}","${formatMoney(data.summary.totalPaid)}"`);
  lines.push(`"${labels.totalDue ?? 'Total Due'}","${formatMoney(data.summary.totalDue)}"`);
  lines.push(`"${labels.invoiceCount ?? 'Invoice Count'}",${data.summary.invoiceCount}`);
  lines.push('');

  lines.push(`"${labels.topProducts ?? 'Top Products'}"`);
  lines.push('"Product","Unit","Quantity","Revenue"');
  for (const item of data.topProducts) {
    lines.push(
      `"${item.name}","${item.unit}",${(item.qtyMilli / 1000).toFixed(2)},"${formatMoney(item.revenue)}"`,
    );
  }
  lines.push('');

  lines.push(`"${labels.topDebtors ?? 'Top Debtors'}"`);
  lines.push('"Customer","Phone","Outstanding Due"');
  for (const debtor of data.topDebtors) {
    lines.push(`"${debtor.name}","${debtor.phone ?? ''}","${formatMoney(debtor.balance)}"`);
  }

  return lines.join('\n');
}

export function buildReportHtml(
  data: ReportData,
  shop: ShopRow,
  formatMoney: (m: MinorUnits) => string,
  labels: Record<string, string>,
): string {
  const periodLabel = labels[data.period] ?? data.period;

  const content = `
    <header class="header">
      <div>
        <div class="shop-name">${escapeHtml(shop.name)}</div>
        <div class="invoice-title">${escapeHtml(labels.title ?? 'Business Report')} - ${escapeHtml(periodLabel)}</div>
      </div>
    </header>

    <div style="display: flex; gap: 16px; margin: 24px 0;">
      <div style="flex: 1; border: 1px solid #e5e5e5; border-radius: 8px; padding: 12px;">
        <div style="font-size: 12px; color: #666;">${escapeHtml(labels.totalSales ?? 'Total Sales')}</div>
        <div style="font-size: 18px; font-weight: bold; margin-top: 4px;">${escapeHtml(formatMoney(data.summary.totalSales))}</div>
      </div>
      <div style="flex: 1; border: 1px solid #e5e5e5; border-radius: 8px; padding: 12px;">
        <div style="font-size: 12px; color: #666;">${escapeHtml(labels.totalPaid ?? 'Collected')}</div>
        <div style="font-size: 18px; font-weight: bold; color: #16a34a; margin-top: 4px;">${escapeHtml(formatMoney(data.summary.totalPaid))}</div>
      </div>
      <div style="flex: 1; border: 1px solid #e5e5e5; border-radius: 8px; padding: 12px;">
        <div style="font-size: 12px; color: #666;">${escapeHtml(labels.totalDue ?? 'Outstanding')}</div>
        <div style="font-size: 18px; font-weight: bold; color: #dc2626; margin-top: 4px;">${escapeHtml(formatMoney(data.summary.totalDue))}</div>
      </div>
    </div>

    <h2>${escapeHtml(labels.topProducts ?? 'Top Products')}</h2>
    <table class="items" style="margin-bottom: 24px;">
      <thead>
        <tr>
          <th>Product</th>
          <th>Unit</th>
          <th class="num">Quantity</th>
          <th class="num">Revenue</th>
        </tr>
      </thead>
      <tbody>
        ${data.topProducts
          .map(
            (p) => `
          <tr>
            <td>${escapeHtml(p.name)}</td>
            <td>${escapeHtml(p.unit)}</td>
            <td class="num">${(p.qtyMilli / 1000).toFixed(2)}</td>
            <td class="num">${escapeHtml(formatMoney(p.revenue))}</td>
          </tr>`,
          )
          .join('')}
      </tbody>
    </table>

    <h2>${escapeHtml(labels.topDebtors ?? 'Top Debtors')}</h2>
    <table class="items">
      <thead>
        <tr>
          <th>Customer</th>
          <th>Phone</th>
          <th class="num">Outstanding Balance</th>
        </tr>
      </thead>
      <tbody>
        ${data.topDebtors
          .map(
            (d) => `
          <tr>
            <td>${escapeHtml(d.name)}</td>
            <td>${escapeHtml(d.phone ?? '')}</td>
            <td class="num" style="color: #dc2626;">${escapeHtml(formatMoney(d.balance))}</td>
          </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  `;

  return documentHtml({
    title: `${shop.name} Report - ${periodLabel}`,
    lang: 'en',
    format: 'a4',
    body: content,
  });
}

export async function exportReport(
  data: ReportData,
  format: 'csv' | 'pdf',
  shop: ShopRow,
  formatMoney: (m: MinorUnits) => string,
  labels: Record<string, string>,
): Promise<string> {
  const fileName = `report_${data.period}_${Date.now()}`;

  if (format === 'csv') {
    const csv = buildReportCsv(data, formatMoney, labels);
    const uri = await writeCacheFile(`${fileName}.csv`, csv);
    await shareFile(uri, 'text/csv', labels.title ?? 'Sales Report');
    return uri;
  } else {
    const html = buildReportHtml(data, shop, formatMoney, labels);
    const uri = await htmlToPdf(html, fileName, 'a4');
    await shareFile(uri, 'application/pdf', labels.title ?? 'Sales Report');
    return uri;
  }
}
