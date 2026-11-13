import { type PageFormat } from '@/core/documents';
import { useLanguage, useTranslation } from '@/core/i18n';
import { htmlToPdf, printHtml, shareFile } from '@/core/platform';
import { type ShopContext, usePlan, useServices } from '@/core/services';

import { buildInvoiceHtml, type InvoiceDocumentLabels } from './document';
import { type InvoiceDetails } from './types';
import { invoiceBadgeStatus } from './usecases';

/** The translated words printed on an invoice, in the current interface language. */
export function useInvoiceDocumentLabels(): InvoiceDocumentLabels {
  const { t } = useTranslation();
  return {
    invoice: t('invoices.invoice'),
    invoiceNumber: t('invoices.number'),
    date: t('invoices.date'),
    customer: t('invoices.customer'),
    walkIn: t('common.walkIn'),
    item: t('invoices.document.item'),
    quantity: t('invoices.document.quantity'),
    price: t('invoices.document.price'),
    amount: t('invoices.document.amount'),
    subtotal: t('invoices.subtotal'),
    discount: t('invoices.discount'),
    total: t('invoices.total'),
    paid: t('invoices.paid'),
    due: t('invoices.due'),
    phone: t('invoices.document.phone'),
    status: {
      PAID: t('status.paid'),
      PARTLY_PAID: t('status.partlyPaid'),
      DUE: t('status.due'),
      CANCELLED: t('status.cancelled'),
    },
    watermark: t('invoices.document.watermark'),
  };
}

export interface InvoiceDocumentActions {
  /** The invoice as an HTML document for the given paper size. */
  html: (details: InvoiceDetails, format: PageFormat) => string;
  /** Creates a PDF and opens the OS share sheet; the user picks the app and sends it. */
  sharePdf: (details: InvoiceDetails, format: PageFormat) => Promise<void>;
  /** Opens the system print dialog. */
  print: (details: InvoiceDetails, format: PageFormat) => Promise<void>;
}

/**
 * Builds, shares and prints invoice documents. Everything happens on the device: no network
 * is involved in creating or sharing an invoice (AGENTS.md §1 rules 1 and 6).
 */
export function useInvoiceDocument(app: ShopContext): InvoiceDocumentActions {
  const labels = useInvoiceDocumentLabels();
  const language = useLanguage();
  const { now } = useServices();
  // Free plan: watermark and no logo. Pro: logo, no watermark (AGENTS.md §11).
  const watermark = usePlan(now) !== 'PRO';

  const html = (details: InvoiceDetails, format: PageFormat) =>
    buildInvoiceHtml({
      language,
      format,
      shop: app.shop,
      invoice: details.invoice,
      items: details.items,
      customerName: details.customerName,
      status: invoiceBadgeStatus(details.invoice, details.settledLater),
      watermark,
      labels,
      formatters: app.format,
    });

  return {
    html,
    sharePdf: async (details, format) => {
      const uri = await htmlToPdf(html(details, format), details.invoice.invoiceNumber, format);
      await shareFile(uri, 'application/pdf', `${labels.invoice} ${details.invoice.invoiceNumber}`);
    },
    print: (details, format) => printHtml(html(details, format)),
  };
}
