import { draftFromParsedSale } from '../draft-adapter';
import { parseVoice } from '../parser';
import { type ParsedSale, type ParserContext } from '../types';

describe('voice parser pipeline', () => {
  const context: ParserContext = {
    customers: [
      { id: 'c1', name: 'Karim', aliases: ['করিম'] },
      { id: 'c2', name: 'Rahim', aliases: ['রহিম'] },
    ],
    products: [
      { id: 'p1', name: 'Rice', unit: 'bag', defaultPrice: 250000, aliases: ['চাল'] },
      { id: 'p2', name: 'Sugar', unit: 'kg', defaultPrice: 12000, aliases: ['চিনি'] },
      { id: 'p3', name: 'Oil', unit: 'liter', defaultPrice: 18000, aliases: ['সয়াবিন তেল', 'তেল'] },
    ],
    corrections: [],
  };

  it('parses English voice sale: "two bags of rice to karim paid half"', () => {
    const res = parseVoice('two bags of rice to karim paid half', context);
    expect(res.intent).toBe('SALE');

    const sale = res as ParsedSale;
    expect(sale.customer?.name).toBe('Karim');
    expect(sale.items).toHaveLength(1);
    expect(sale.items[0]?.name).toBe('Rice');
    expect(sale.items[0]?.qtyMilli).toBe(2000);
    expect(sale.items[0]?.unit).toBe('bag');
    expect(sale.items[0]?.unitPrice).toBe(250000);
    expect(sale.payment.type).toBe('FRACTION');
    if (sale.payment.type === 'FRACTION') {
      expect(sale.payment.numerator).toBe(1);
      expect(sale.payment.denominator).toBe(2);
    }
  });

  it('parses Bengali voice sale: "করিমকে দুই বস্তা চাল দাও অর্ধেক দিছে"', () => {
    const res = parseVoice('করিমকে দুই বস্তা চাল দাও অর্ধেক দিছে', context);
    expect(res.intent).toBe('SALE');

    const sale = res as ParsedSale;
    expect(sale.customer?.name).toBe('Karim');
    expect(sale.items).toHaveLength(1);
    expect(sale.items[0]?.name).toBe('Rice');
    expect(sale.items[0]?.qtyMilli).toBe(2000);
    expect(sale.payment.type).toBe('FRACTION');
  });

  it('parses code-mixed voice sale: "Karim ke 2 bag rice paid half"', () => {
    const res = parseVoice('Karim ke 2 bag rice paid half', context);
    expect(res.intent).toBe('SALE');

    const sale = res as ParsedSale;
    expect(sale.customer?.name).toBe('Karim');
    expect(sale.items[0]?.qtyMilli).toBe(2000);
  });

  it('parses payment with cash/full: "Rahim 3 kg sugar paid cash"', () => {
    const res = parseVoice('Rahim 3 kg sugar paid cash', context);
    expect(res.intent).toBe('SALE');

    const sale = res as ParsedSale;
    expect(sale.customer?.name).toBe('Rahim');
    expect(sale.items[0]?.qtyMilli).toBe(3000);
    expect(sale.payment.type).toBe('FULL');
  });

  it('parses credit sale: "three kg sugar to Rahim on credit"', () => {
    const res = parseVoice('three kg sugar to Rahim on credit', context);
    expect(res.intent).toBe('SALE');

    const sale = res as ParsedSale;
    expect(sale.payment.type).toBe('NONE');
  });

  it('parses payment intent: "payment from Karim 500"', () => {
    const res = parseVoice('payment from Karim 500', context);
    expect(res.intent).toBe('PAYMENT');
    if (res.intent === 'PAYMENT') {
      expect(res.customer?.name).toBe('Karim');
      expect(res.amount).toBe(50000);
    }
  });

  it('parses query intent for customer balance: "what is Karim balance"', () => {
    const res = parseVoice('what is Karim balance', context);
    expect(res.intent).toBe('QUERY');
    if (res.intent === 'QUERY') {
      expect(res.queryType).toBe('CUSTOMER_BALANCE');
      expect(res.customer?.name).toBe('Karim');
    }
  });

  it('parses query intent for today sales: "today sales"', () => {
    const res = parseVoice('today sales', context);
    expect(res.intent).toBe('QUERY');
    if (res.intent === 'QUERY') {
      expect(res.queryType).toBe('TODAYS_SALES');
    }
  });

  it('converts parsed sale to InvoiceDraft seamlessly', () => {
    const res = parseVoice('two bags of rice to karim paid half', context) as ParsedSale;
    const draft = draftFromParsedSale(res);

    expect(draft.customerId).toBe('c1');
    expect(draft.customerName).toBe('Karim');
    expect(draft.items).toHaveLength(1);
    expect(draft.items[0]?.name).toBe('Rice');
    expect(draft.items[0]?.qtyMilli).toBe(2000);
    expect(draft.items[0]?.unitPrice).toBe(250000);
    expect(draft.payment.type).toBe('FRACTION');
  });
});

