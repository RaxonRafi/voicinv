import { documentHtml, escapeHtml, type PageFormat } from '@/core/documents';
import { type Formatters } from '@/core/i18n';
import { type LanguageCode } from '@/shared';

import { type InvoiceBadgeStatus, type InvoiceItemRow, type InvoiceRow } from './types';

/** Translated words printed on an invoice. Supplied by the caller, so this file stays pure. */
export interface InvoiceDocumentLabels {
  invoice: string;
  invoiceNumber: string;
  date: string;
  customer: string;
  walkIn: string;
  item: string;
  quantity: string;
  price: string;
  amount: string;
  subtotal: string;
  discount: string;
  total: string;
  paid: string;
  due: string;
  phone: string;
  status: Record<InvoiceBadgeStatus, string>;
  /** Printed at the bottom on the free plan; omitted on Pro. */
  watermark: string;
}

export interface InvoiceDocumentInput {
  language: LanguageCode;
  format: PageFormat;
  shop: { name: string; address: string | null; phone: string | null; logo: string | null };
  invoice: InvoiceRow;
  items: readonly InvoiceItemRow[];
  customerName: string | null;
  status: InvoiceBadgeStatus;
  /** Free plan: show the watermark and no logo. */
  watermark: boolean;
  labels: InvoiceDocumentLabels;
  formatters: Formatters;
}

/**
 * Builds the printable invoice as HTML: one template for A4 and for 58 mm / 80 mm thermal
 * paper. Pure; all money and numbers are formatted through the shared formatter.
 */
export function buildInvoiceHtml({
  language,
  format,
  shop,
  invoice,
  items,
  customerName,
  status,
  watermark,
  labels,
  formatters,
}: InvoiceDocumentInput): string {
  const narrow = format !== 'a4';
  const cancelled = invoice.status === 'CANCELLED';
  const money = (amount: number) => escapeHtml(formatters.money(amount));

  const logo =
    shop.logo && !watermark
      ? `<img class="logo" src="${escapeHtml(shop.logo)}" alt="${escapeHtml(shop.name)}">`
      : '';
  const contact = [
    shop.address ? `<p class="muted">${escapeHtml(shop.address)}</p>` : '',
    shop.phone ? `<p class="muted">${escapeHtml(labels.phone)}: ${escapeHtml(shop.phone)}</p>` : '',
  ].join('');

  const rows = items
    .map((item) => {
      const quantity = `${formatters.quantity(item.qtyMilli)} ${item.unit}`;
      if (narrow) {
        // Thermal paper is too narrow for four columns: name on one line, numbers on the next.
        return `<tr><td>${escapeHtml(item.nameSnapshot)}<br><span class="muted">${escapeHtml(
          quantity,
        )} × ${money(item.unitPrice)}</span></td><td class="right amount">${money(
          item.lineTotal,
        )}</td></tr>`;
      }
      return `<tr><td>${escapeHtml(item.nameSnapshot)}</td><td class="right">${escapeHtml(
        quantity,
      )}</td><td class="right amount">${money(item.unitPrice)}</td><td class="right amount">${money(
        item.lineTotal,
      )}</td></tr>`;
    })
    .join('\n');

  const head = narrow
    ? `<tr><th>${escapeHtml(labels.item)}</th><th class="right">${escapeHtml(labels.amount)}</th></tr>`
    : `<tr><th>${escapeHtml(labels.item)}</th><th class="right">${escapeHtml(
        labels.quantity,
      )}</th><th class="right">${escapeHtml(labels.price)}</th><th class="right">${escapeHtml(
        labels.amount,
      )}</th></tr>`;

  const line = (label: string, value: string, className = '') =>
    `<div class="row ${className}"><span>${escapeHtml(label)}</span><span class="amount">${value}</span></div>`;

  const body = `
<header class="row">
  <div>
    ${logo}
    <h1>${escapeHtml(shop.name)}</h1>
    ${contact}
  </div>
  <div class="right">
    <h2>${escapeHtml(labels.invoice)}</h2>
    <p class="strong${cancelled ? ' cancelled' : ''}">${escapeHtml(invoice.invoiceNumber)}</p>
    <p class="muted">${escapeHtml(formatters.dateTime(invoice.date))}</p>
  </div>
</header>
<hr class="rule">
<div class="row">
  <p><span class="muted">${escapeHtml(labels.customer)}:</span> <span class="strong">${escapeHtml(
    customerName ?? labels.walkIn,
  )}</span></p>
  <p><span class="badge">${escapeHtml(labels.status[status])}</span></p>
</div>
<table class="section">
  <thead>${head}</thead>
  <tbody>
${rows}
  </tbody>
</table>
<div class="section">
  ${line(labels.subtotal, money(invoice.subtotal))}
  ${invoice.discount > 0 ? line(labels.discount, `−${money(invoice.discount)}`) : ''}
  ${line(labels.total, money(invoice.total), 'strong')}
  ${line(labels.paid, money(invoice.paidAmount), 'paid')}
  ${line(labels.due, money(invoice.dueAmount), invoice.dueAmount > 0 ? 'due strong' : '')}
</div>
${watermark ? `<p class="watermark">${escapeHtml(labels.watermark)}</p>` : ''}`;

  return documentHtml({
    lang: language,
    title: `${labels.invoice} ${invoice.invoiceNumber}`,
    format,
    body,
  });
}
