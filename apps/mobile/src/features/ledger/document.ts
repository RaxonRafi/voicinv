import { documentHtml, escapeHtml } from '@/core/documents';
import { type Formatters } from '@/core/i18n';
import { type LanguageCode, type LedgerEntryType } from '@/shared';

import { type StatementLine } from './usecases';

/** Translated words printed on a statement. Supplied by the caller, so this file stays pure. */
export interface StatementLabels {
  title: string;
  date: string;
  description: string;
  amount: string;
  balance: string;
  closing: string;
  phone: string;
  entries: Record<LedgerEntryType, string>;
}

export interface StatementInput {
  language: LanguageCode;
  shop: { name: string; address: string | null; phone: string | null };
  customer: { name: string; phone: string | null };
  lines: readonly StatementLine[];
  /** The closing balance in words, e.g. "Owes ৳1,800". */
  closingText: string;
  labels: StatementLabels;
  formatters: Formatters;
}

/** Amount with an explicit sign, so charges and payments are distinct without color. */
export function signedMoney(amount: number, formatters: Formatters): string {
  const text = formatters.money(Math.abs(amount));
  if (amount === 0) return text;
  return amount > 0 ? `+${text}` : `−${text}`;
}

/** Builds a customer's account statement as an A4 HTML document. Pure. */
export function buildStatementHtml({
  language,
  shop,
  customer,
  lines,
  closingText,
  labels,
  formatters,
}: StatementInput): string {
  const rows = lines
    .map(({ entry, invoiceNumber, balance }) => {
      const description = invoiceNumber
        ? `${labels.entries[entry.type]} · ${invoiceNumber}`
        : labels.entries[entry.type];
      return `<tr><td>${escapeHtml(formatters.date(entry.createdAt))}</td><td>${escapeHtml(
        description,
      )}</td><td class="right amount ${entry.amount > 0 ? 'due' : 'paid'}">${escapeHtml(
        signedMoney(entry.amount, formatters),
      )}</td><td class="right amount">${escapeHtml(formatters.money(balance))}</td></tr>`;
    })
    .join('\n');

  const body = `
<header class="row">
  <div>
    <h1>${escapeHtml(shop.name)}</h1>
    ${shop.address ? `<p class="muted">${escapeHtml(shop.address)}</p>` : ''}
    ${shop.phone ? `<p class="muted">${escapeHtml(labels.phone)}: ${escapeHtml(shop.phone)}</p>` : ''}
  </div>
  <div class="right">
    <h2>${escapeHtml(labels.title)}</h2>
    <p class="strong">${escapeHtml(customer.name)}</p>
    ${customer.phone ? `<p class="muted">${escapeHtml(customer.phone)}</p>` : ''}
  </div>
</header>
<hr class="rule">
<table>
  <thead><tr><th>${escapeHtml(labels.date)}</th><th>${escapeHtml(
    labels.description,
  )}</th><th class="right">${escapeHtml(labels.amount)}</th><th class="right">${escapeHtml(
    labels.balance,
  )}</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table>
<div class="section row strong">
  <span>${escapeHtml(labels.closing)}</span>
  <span class="amount">${escapeHtml(closingText)}</span>
</div>`;

  return documentHtml({
    lang: language,
    title: `${labels.title} · ${customer.name}`,
    format: 'a4',
    body,
  });
}
