import { type InvoiceItemRow, type InvoiceRow } from '@/features/invoices';
import { type Formatters } from '@/core/i18n';

import { EscPosBuilder } from '../escpos/encoder';
import { type PaperSize } from '../types';

export interface FormatInvoiceReceiptInput {
  shop: {
    name: string;
    address: string | null;
    phone: string | null;
  };
  invoice: InvoiceRow;
  items: readonly InvoiceItemRow[];
  customerName: string | null;
  paperSize: PaperSize;
  formatters: Formatters;
  watermark?: boolean;
}

export function formatInvoiceEscPos({
  shop,
  invoice,
  items,
  customerName,
  paperSize,
  formatters,
  watermark = false,
}: FormatInvoiceReceiptInput): Uint8Array {
  const builder = new EscPosBuilder();

  // Header
  builder.align('center');
  builder.bold(true);
  builder.size(true, true);
  builder.line(shop.name);
  builder.size(false, false);
  builder.bold(false);

  if (shop.address) {
    builder.line(shop.address);
  }
  if (shop.phone) {
    builder.line(`Phone: ${shop.phone}`);
  }

  builder.divider(paperSize, '=');

  // Metadata
  builder.align('left');
  builder.twoColumns(`Inv: ${invoice.invoiceNumber}`, formatters.date(invoice.date), paperSize);
  builder.line(`Customer: ${customerName ?? 'Walk-in'}`);

  builder.divider(paperSize, '-');

  // Items
  for (const item of items) {
    builder.line(item.nameSnapshot);
    const leftText = `  ${formatters.quantity(item.qtyMilli)} ${item.unit} x ${formatters.money(item.unitPrice)}`;
    const rightText = formatters.money(item.lineTotal);
    builder.twoColumns(leftText, rightText, paperSize);
  }

  builder.divider(paperSize, '-');

  // Totals
  builder.twoColumns('Subtotal:', formatters.money(invoice.subtotal), paperSize);
  if (invoice.discount > 0) {
    builder.twoColumns('Discount:', `-${formatters.money(invoice.discount)}`, paperSize);
  }

  builder.bold(true);
  builder.twoColumns('Total:', formatters.money(invoice.total), paperSize);
  builder.bold(false);

  builder.twoColumns('Paid:', formatters.money(invoice.paidAmount), paperSize);
  if (invoice.dueAmount > 0) {
    builder.bold(true);
    builder.twoColumns('Due:', formatters.money(invoice.dueAmount), paperSize);
    builder.bold(false);
  }

  builder.divider(paperSize, '=');

  // Footer
  builder.align('center');
  builder.line('Thank You For Your Business!');

  if (watermark) {
    builder.line('Powered by VoiceLedger');
  }

  builder.cut(true);

  return builder.build();
}
