import {
  computeInvoiceTotals,
  type InvoiceTotals,
  type MinorUnits,
  type PaymentInstruction,
  QUANTITY_SCALE,
} from '@/domain';

import { type InvoiceInput } from './invoices';
import { type InvoiceDetails } from './selectors';

// The invoice being written, before it is saved. Typing and voice both produce this draft and
// edit it on the same screen: voice only fills a draft that the manual flow already knows how
// to save. Pure state and functions.

export interface DraftItem {
  /** Stable key for list rendering; not stored. */
  key: string;
  productId: string | null;
  name: string;
  unit: string;
  /** Null while the quantity field is empty or invalid. */
  qtyMilli: number | null;
  /** Null while no price is known (e.g. a product without a usual price). */
  unitPrice: MinorUnits | null;
  /** Parser confidence 0–1 for a voice draft; absent for manual entry. */
  confidence?: number;
}

export interface InvoiceDraft {
  /** Null = walk-in sale. */
  customerId: string | null;
  customerName: string | null;
  customerConfidence?: number;
  items: DraftItem[];
  discount: MinorUnits;
  payment: PaymentInstruction;
  paymentConfidence?: number;
  /** What was said or typed; saved with the invoice. */
  sourceText: string | null;
}

export function emptyDraft(): InvoiceDraft {
  return {
    customerId: null,
    customerName: null,
    items: [],
    discount: 0,
    payment: { type: 'FULL' },
    sourceText: null,
  };
}

/** A draft holding an existing invoice, for editing. What was paid is kept as an amount. */
export function draftFromInvoice(details: InvoiceDetails): InvoiceDraft {
  const { invoice, items, customerName } = details;
  return {
    customerId: invoice.customerId,
    customerName,
    items: items.map((item) => ({
      key: item.id,
      productId: item.productId,
      name: item.nameSnapshot,
      unit: item.unit,
      qtyMilli: item.qtyMilli,
      unitPrice: item.unitPrice,
    })),
    discount: invoice.discount,
    payment: { type: 'AMOUNT', amount: invoice.paidAmount },
    sourceText: invoice.sourceText,
  };
}

export type DraftAction =
  | { type: 'setCustomer'; customer: { id: string; name: string } | null }
  | { type: 'addItem'; item: Omit<DraftItem, 'key'> }
  | { type: 'updateItem'; key: string; changes: Partial<Omit<DraftItem, 'key'>> }
  | { type: 'removeItem'; key: string }
  | { type: 'setDiscount'; discount: MinorUnits }
  | { type: 'setPayment'; payment: PaymentInstruction }
  | { type: 'replace'; draft: InvoiceDraft };

let nextKey = 0;

/** A new line for a product, one unit at its usual price. */
export function itemForProduct(product: {
  id: string;
  name: string;
  unit: string;
  defaultPrice: MinorUnits | null;
}): Omit<DraftItem, 'key'> {
  return {
    productId: product.id,
    name: product.name,
    unit: product.unit,
    qtyMilli: QUANTITY_SCALE,
    unitPrice: product.defaultPrice,
  };
}

export function draftReducer(draft: InvoiceDraft, action: DraftAction): InvoiceDraft {
  switch (action.type) {
    case 'setCustomer':
      return {
        ...draft,
        customerId: action.customer?.id ?? null,
        customerName: action.customer?.name ?? null,
        // The user chose it, so it is no longer an uncertain guess.
        customerConfidence: undefined,
      };
    case 'addItem':
      nextKey += 1;
      return { ...draft, items: [...draft.items, { ...action.item, key: `item-${nextKey}` }] };
    case 'updateItem':
      return {
        ...draft,
        items: draft.items.map((item) =>
          item.key === action.key ? { ...item, ...action.changes, confidence: undefined } : item,
        ),
      };
    case 'removeItem':
      return { ...draft, items: draft.items.filter((item) => item.key !== action.key) };
    case 'setDiscount':
      return { ...draft, discount: action.discount };
    case 'setPayment':
      return { ...draft, payment: action.payment, paymentConfidence: undefined };
    case 'replace':
      return action.draft;
  }
}

export type DraftProblem =
  | { code: 'noItems' }
  | { code: 'itemName' | 'itemQuantity' | 'itemPrice'; key: string }
  | { code: 'discountTooBig' }
  | { code: 'walkInDue' };

type CompleteItem = DraftItem & { qtyMilli: number; unitPrice: MinorUnits };

function isComplete(item: DraftItem): item is CompleteItem {
  return (
    item.name.trim() !== '' &&
    item.unit.trim() !== '' &&
    item.qtyMilli !== null &&
    item.qtyMilli > 0 &&
    item.unitPrice !== null &&
    item.unitPrice >= 0
  );
}

/**
 * Totals of the draft as it stands, or null while any line is incomplete or the discount is
 * larger than the subtotal. Uses the same arithmetic as saving.
 */
export function draftTotals(draft: InvoiceDraft): InvoiceTotals | null {
  if (!draft.items.every(isComplete)) return null;
  try {
    return computeInvoiceTotals({
      lines: draft.items,
      discount: draft.discount,
      payment: draft.payment,
    });
  } catch {
    return null;
  }
}

/** Everything that stops the draft from being saved, in the order the screen shows it. */
export function draftProblems(draft: InvoiceDraft): DraftProblem[] {
  const problems: DraftProblem[] = [];
  if (draft.items.length === 0) problems.push({ code: 'noItems' });
  for (const item of draft.items) {
    if (item.name.trim() === '' || item.unit.trim() === '') {
      problems.push({ code: 'itemName', key: item.key });
    }
    if (item.qtyMilli === null || item.qtyMilli <= 0) {
      problems.push({ code: 'itemQuantity', key: item.key });
    }
    if (item.unitPrice === null || item.unitPrice < 0) {
      problems.push({ code: 'itemPrice', key: item.key });
    }
  }
  if (problems.length > 0) return problems;

  const totals = draftTotals(draft);
  if (!totals) return [{ code: 'discountTooBig' }];
  if (draft.customerId === null && totals.dueAmount > 0) problems.push({ code: 'walkInDue' });
  return problems;
}

/** The use-case input for a draft without problems. Throws if the draft is not ready. */
export function draftToInput(draft: InvoiceDraft): InvoiceInput {
  if (draftProblems(draft).length > 0) throw new Error('The draft still has problems');
  return {
    customerId: draft.customerId,
    items: draft.items.filter(isComplete).map((item) => ({
      productId: item.productId,
      name: item.name,
      unit: item.unit,
      qtyMilli: item.qtyMilli,
      unitPrice: item.unitPrice,
    })),
    discount: draft.discount,
    payment: draft.payment,
    sourceText: draft.sourceText,
  };
}
