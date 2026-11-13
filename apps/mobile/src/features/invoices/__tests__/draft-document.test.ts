import { createFormatters } from '@/core/i18n';
import { createTestShopApp } from '@/core/testing/harness';
import { createCustomer } from '@/features/customers';

import { buildInvoiceHtml, type InvoiceDocumentLabels } from '../document';
import {
  draftFromInvoice,
  draftProblems,
  draftReducer,
  draftTotals,
  draftToInput,
  emptyDraft,
  type InvoiceDraft,
  itemForProduct,
} from '../draft';
import { createInvoice, getInvoiceDetails } from '../usecases';

const rice = { id: 'p1', name: 'Rice', unit: 'bag', defaultPrice: 250_000 };

function withRice(quantityMilli = 2000): InvoiceDraft {
  let draft = draftReducer(emptyDraft(), { type: 'addItem', item: itemForProduct(rice) });
  const key = draft.items[0]?.key ?? '';
  draft = draftReducer(draft, { type: 'updateItem', key, changes: { qtyMilli: quantityMilli } });
  return draft;
}

describe('invoice draft', () => {
  it('starts as an empty walk-in sale paid in full', () => {
    const draft = emptyDraft();
    expect(draft).toMatchObject({
      customerId: null,
      items: [],
      discount: 0,
      payment: { type: 'FULL' },
    });
    expect(draftProblems(draft)).toEqual([{ code: 'noItems' }]);
  });

  it('adds a product as one unit at its usual price and totals the draft live', () => {
    const draft = withRice();
    expect(draft.items[0]).toMatchObject({
      productId: 'p1',
      name: 'Rice',
      qtyMilli: 2000,
      unitPrice: 250_000,
    });
    expect(draftTotals(draft)).toMatchObject({ total: 500_000, paidAmount: 500_000, dueAmount: 0 });
    expect(draftProblems(draft)).toEqual([]);
  });

  it('gives every added line its own key and removes lines by key', () => {
    let draft = withRice();
    draft = draftReducer(draft, { type: 'addItem', item: itemForProduct(rice) });
    const [first, second] = draft.items;
    expect(first?.key).not.toBe(second?.key);

    draft = draftReducer(draft, { type: 'removeItem', key: first?.key ?? '' });
    expect(draft.items.map((item) => item.key)).toEqual([second?.key]);
  });

  it('points at exactly what is missing on each line', () => {
    let draft = draftReducer(emptyDraft(), {
      type: 'addItem',
      item: { productId: null, name: '', unit: 'kg', qtyMilli: null, unitPrice: null },
    });
    const key = draft.items[0]?.key ?? '';
    expect(draftProblems(draft)).toEqual([
      { code: 'itemName', key },
      { code: 'itemQuantity', key },
      { code: 'itemPrice', key },
    ]);
    expect(draftTotals(draft)).toBeNull();

    draft = draftReducer(draft, {
      type: 'updateItem',
      key,
      changes: { name: 'Sugar', qtyMilli: 1500 },
    });
    expect(draftProblems(draft)).toEqual([{ code: 'itemPrice', key }]);
  });

  it('requires a customer before anything may be left due', () => {
    let draft = draftReducer(withRice(), { type: 'setPayment', payment: { type: 'NONE' } });
    expect(draftProblems(draft)).toEqual([{ code: 'walkInDue' }]);

    draft = draftReducer(draft, { type: 'setCustomer', customer: { id: 'c1', name: 'Karim' } });
    expect(draftProblems(draft)).toEqual([]);
    expect(draftTotals(draft)).toMatchObject({ paidAmount: 0, dueAmount: 500_000 });

    draft = draftReducer(draft, { type: 'setCustomer', customer: null });
    expect(draft).toMatchObject({ customerId: null, customerName: null });
  });

  it('rejects a discount larger than the subtotal', () => {
    const draft = draftReducer(withRice(), { type: 'setDiscount', discount: 600_000 });
    expect(draftProblems(draft)).toEqual([{ code: 'discountTooBig' }]);
    expect(() => draftToInput(draft)).toThrow();
  });

  it('clears a low-confidence mark once the user has corrected the field', () => {
    let draft: InvoiceDraft = {
      ...withRice(),
      customerId: 'c1',
      customerName: 'Karim',
      customerConfidence: 0.5,
      paymentConfidence: 0.4,
    };
    const key = draft.items[0]?.key ?? '';
    draft = { ...draft, items: draft.items.map((item) => ({ ...item, confidence: 0.3 })) };

    draft = draftReducer(draft, { type: 'setCustomer', customer: { id: 'c2', name: 'Rahim' } });
    draft = draftReducer(draft, { type: 'updateItem', key, changes: { qtyMilli: 3000 } });
    draft = draftReducer(draft, { type: 'setPayment', payment: { type: 'FULL' } });

    expect(draft.customerConfidence).toBeUndefined();
    expect(draft.paymentConfidence).toBeUndefined();
    expect(draft.items[0]?.confidence).toBeUndefined();
  });

  it('turns a finished draft into exactly the input the use case saves', () => {
    let draft = draftReducer(withRice(), {
      type: 'setCustomer',
      customer: { id: 'c1', name: 'Karim' },
    });
    draft = draftReducer(draft, {
      type: 'setPayment',
      payment: { type: 'FRACTION', numerator: 1, denominator: 2 },
    });
    expect(draftToInput({ ...draft, sourceText: 'two bags of rice to karim paid half' })).toEqual({
      customerId: 'c1',
      items: [{ productId: 'p1', name: 'Rice', unit: 'bag', qtyMilli: 2000, unitPrice: 250_000 }],
      discount: 0,
      payment: { type: 'FRACTION', numerator: 1, denominator: 2 },
      sourceText: 'two bags of rice to karim paid half',
    });
  });

  it('loads a saved invoice back into a draft that saves to the same amounts', async () => {
    const app = await createTestShopApp();
    const karim = await createCustomer(app.ctx, {
      name: 'Karim',
      phone: '',
      notes: '',
      creditLimit: null,
      aliases: [],
    });
    const invoice = await createInvoice(app.ctx, {
      customerId: karim.id,
      items: [{ productId: null, name: 'Rice', unit: 'bag', qtyMilli: 2000, unitPrice: 250_000 }],
      discount: 20_000,
      payment: { type: 'FRACTION', numerator: 1, denominator: 2 },
      sourceText: null,
    });
    const details = await getInvoiceDetails(app.db.orm, invoice.id);
    if (!details) throw new Error('invoice not found');

    const draft = draftFromInvoice(details);
    expect(draft).toMatchObject({ customerId: karim.id, customerName: 'Karim', discount: 20_000 });
    expect(draftTotals(draft)).toMatchObject({
      total: invoice.total,
      paidAmount: invoice.paidAmount,
      dueAmount: invoice.dueAmount,
    });
    await app.close();
  });
});

describe('buildInvoiceHtml', () => {
  const labels: InvoiceDocumentLabels = {
    invoice: 'Invoice',
    invoiceNumber: 'Invoice no.',
    date: 'Date',
    customer: 'Customer',
    walkIn: 'Walk-in customer',
    item: 'Item',
    quantity: 'Qty',
    price: 'Price',
    amount: 'Amount',
    subtotal: 'Subtotal',
    discount: 'Discount',
    total: 'Total',
    paid: 'Paid',
    due: 'Due',
    phone: 'Phone',
    status: { PAID: 'Paid', PARTLY_PAID: 'Partly paid', DUE: 'Due', CANCELLED: 'Cancelled' },
    watermark: 'Made with VoiceLedger',
  };

  async function sample() {
    const app = await createTestShopApp();
    const karim = await createCustomer(app.ctx, {
      name: 'Karim & <Sons>',
      phone: '',
      notes: '',
      creditLimit: null,
      aliases: [],
    });
    const invoice = await createInvoice(app.ctx, {
      customerId: karim.id,
      items: [
        { productId: null, name: 'Rice', unit: 'bag', qtyMilli: 2000, unitPrice: 250_000 },
        { productId: null, name: 'Sugar "fine"', unit: 'kg', qtyMilli: 1500, unitPrice: 14_000 },
      ],
      discount: 1000,
      payment: { type: 'FRACTION', numerator: 1, denominator: 2 },
      sourceText: null,
    });
    const details = await getInvoiceDetails(app.db.orm, invoice.id);
    await app.close();
    if (!details) throw new Error('invoice not found');
    return details;
  }

  const shop = {
    name: 'Rahim Store',
    address: 'Station Road',
    phone: '01712345678',
    logo: 'data:image/png;base64,AAAA',
  };

  it('prints the shop, number, customer, every line and the paid/due split', async () => {
    const details = await sample();
    const html = buildInvoiceHtml({
      language: 'en',
      format: 'a4',
      shop,
      invoice: details.invoice,
      items: details.items,
      customerName: details.customerName,
      status: 'PARTLY_PAID',
      watermark: false,
      labels,
      formatters: createFormatters('en', 'BDT'),
    });

    expect(html).toContain('<html lang="en">');
    expect(html).toContain('Rahim Store');
    expect(html).toContain('RS-A-000001');
    expect(html).toContain('2 bag');
    expect(html).toContain('1.5 kg');
    expect(html).toContain('৳5,000'); // rice line
    expect(html).toContain('৳210'); // sugar line: 1.5 × 140
    expect(html).toContain('৳5,210'); // subtotal
    expect(html).toContain('−৳10'); // discount
    expect(html).toContain('৳5,200'); // total
    expect(html).toContain('৳2,600'); // paid and due
    expect(html).toContain('Partly paid');
    expect(html).toContain('class="logo"');
    expect(html).not.toContain('Made with VoiceLedger');
  });

  it('escapes everything the user typed', async () => {
    const details = await sample();
    const html = buildInvoiceHtml({
      language: 'en',
      format: 'a4',
      shop: { ...shop, name: '<script>alert(1)</script>' },
      invoice: details.invoice,
      items: details.items,
      customerName: details.customerName,
      status: 'DUE',
      watermark: true,
      labels,
      formatters: createFormatters('en', 'BDT'),
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Karim &amp; &lt;Sons&gt;');
    expect(html).toContain('Sugar &quot;fine&quot;');
  });

  it('adds the watermark and drops the logo on the free plan', async () => {
    const details = await sample();
    const html = buildInvoiceHtml({
      language: 'en',
      format: 'a4',
      shop,
      invoice: details.invoice,
      items: details.items,
      customerName: details.customerName,
      status: 'DUE',
      watermark: true,
      labels,
      formatters: createFormatters('en', 'BDT'),
    });
    expect(html).toContain('Made with VoiceLedger');
    expect(html).not.toContain('class="logo"');
  });

  it('uses Bengali digits and a two-column layout on thermal paper', async () => {
    const details = await sample();
    const html = buildInvoiceHtml({
      language: 'bn',
      format: 'thermal58',
      shop: { ...shop, logo: null },
      invoice: details.invoice,
      items: details.items,
      customerName: null,
      status: 'PAID',
      watermark: false,
      labels,
      formatters: createFormatters('bn', 'BDT'),
    });

    expect(html).toContain('<html lang="bn">');
    expect(html).toContain('৫,২০০৳');
    expect(html).toContain('২ bag');
    expect(html).toContain('Walk-in customer');
    expect(html).toContain('size: 58mm');
    // Item + Amount only: no separate Qty / Price header cells.
    expect(html).not.toContain('>Qty<');
  });

  it('strikes through the number of a cancelled invoice', async () => {
    const details = await sample();
    const html = buildInvoiceHtml({
      language: 'en',
      format: 'a4',
      shop,
      invoice: { ...details.invoice, status: 'CANCELLED' },
      items: details.items,
      customerName: details.customerName,
      status: 'CANCELLED',
      watermark: false,
      labels,
      formatters: createFormatters('en', 'BDT'),
    });
    expect(html).toContain('class="strong cancelled"');
    expect(html).toContain('>Cancelled<');
  });
});
