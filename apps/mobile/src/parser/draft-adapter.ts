import { type InvoiceDraftShape, type ParsedSale } from './types';

let nextDraftKey = 0;

/**
 * Converts a parsed sale result into an InvoiceDraftShape ready for the confirmation screen.
 */
export function draftFromParsedSale(sale: ParsedSale): InvoiceDraftShape {
  return {
    customerId: sale.customer?.id ?? null,
    customerName: sale.customer?.name ?? null,
    customerConfidence: sale.customerConfidence,
    items: sale.items.map((item) => {
      nextDraftKey++;
      return {
        key: `parsed-${nextDraftKey}`,
        productId: item.productId,
        name: item.name,
        unit: item.unit,
        qtyMilli: item.qtyMilli,
        unitPrice: item.unitPrice,
        confidence: item.confidence,
      };
    }),
    discount: sale.discount,
    payment: sale.payment,
    paymentConfidence: sale.paymentConfidence,
    sourceText: sale.sourceText,
  };
}
