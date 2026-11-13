import { customers, ledgerEntries, products } from '@/core/db';
import { createFormatters } from '@/core/i18n';
import { createTestShopApp, type TestShopApp } from '@/core/testing/harness';
import { type InvoiceDraftShape } from '@/parser';

import { FakeTTSEngine } from '../tts/fake-tts';
import { answerVoiceQuery, detectAndSaveCorrections, parseVoiceTranscript } from '../usecases';

describe('voice usecases', () => {
  let app: TestShopApp;
  let customerId: string;
  let productId: string;

  beforeEach(async () => {
    app = await createTestShopApp();
    customerId = app.ctx.newId();
    productId = app.ctx.newId();

    await app.ctx.db.write(async (tx) => {
      await tx.orm.insert(customers).values({
        id: customerId,
        shopId: app.shopId,
        name: 'Karim',
        phone: '',
        notes: '',
        creditLimit: null,
        isArchived: false,
        createdAt: app.ctx.now(),
        updatedAt: app.ctx.now(),
        deletedAt: null,
        deviceId: app.ctx.deviceId,
        isDirty: true,
      });

      await tx.orm.insert(products).values({
        id: productId,
        shopId: app.shopId,
        name: 'Rice',
        unit: 'bag',
        defaultPrice: 250000,
        stockQty: null,
        isArchived: false,
        createdAt: app.ctx.now(),
        updatedAt: app.ctx.now(),
        deletedAt: null,
        deviceId: app.ctx.deviceId,
        isDirty: true,
      });
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('parseVoiceTranscript', () => {
    it('parses a sale transcript with customer and item candidates from DB', async () => {
      const res = await parseVoiceTranscript(
        app.ctx.db.orm,
        'two bags of rice to karim paid half',
        'en',
      );

      expect(res.intent).toBe('SALE');
      if (res.intent === 'SALE') {
        expect(res.customer?.name).toBe('Karim');
        expect(res.customer?.id).toBe(customerId);
        expect(res.items).toHaveLength(1);
        expect(res.items[0]?.name).toBe('Rice');
        expect(res.items[0]?.productId).toBe(productId);
        expect(res.items[0]?.qtyMilli).toBe(2000);
        expect(res.payment).toEqual({
          type: 'FRACTION',
          numerator: 1,
          denominator: 2,
          value: 0.5,
        });
      }
    });

    it('parses a payment intent', async () => {
      const res = await parseVoiceTranscript(app.ctx.db.orm, 'received 500 from karim', 'en');
      expect(res.intent).toBe('PAYMENT');
      if (res.intent === 'PAYMENT') {
        expect(res.customer?.name).toBe('Karim');
        expect(res.customer?.id).toBe(customerId);
        expect(res.amount).toBe(50000);
      }
    });

    it('parses a balance query intent', async () => {
      const res = await parseVoiceTranscript(app.ctx.db.orm, 'karim balance', 'en');
      expect(res.intent).toBe('QUERY');
      if (res.intent === 'QUERY') {
        expect(res.queryType).toBe('CUSTOMER_BALANCE');
        expect(res.customer?.name).toBe('Karim');
      }
    });
  });

  describe('answerVoiceQuery', () => {
    const formatters = createFormatters('en', 'BDT');
    const mockTranslate = (key: string, opts?: Record<string, string | number>) => {
      if (key === 'voice.queryBalance') return `${opts?.name} owes ${opts?.balance}.`;
      if (key === 'voice.queryBalanceZero') return `${opts?.name} has no balance due.`;
      if (key === 'voice.queryCustomerNotFound') return 'Customer not found.';
      if (key === 'voice.querySales') return `Today's sales total ${opts?.total}.`;
      if (key === 'voice.querySalesZero') return 'No sales recorded yet today.';
      return key;
    };

    it('answers customer balance query with positive balance', async () => {
      await app.ctx.db.write(async (tx) => {
        await tx.orm.insert(ledgerEntries).values({
          id: app.ctx.newId(),
          shopId: app.shopId,
          customerId,
          type: 'INVOICE_DUE',
          amount: 75000,
          refId: 'inv-1',
          createdAt: app.ctx.now(),
          deviceId: app.ctx.deviceId,
          isDirty: true,
        });
      });

      const tts = new FakeTTSEngine();
      const answer = await answerVoiceQuery({
        orm: app.ctx.db.orm,
        query: {
          intent: 'QUERY',
          queryType: 'CUSTOMER_BALANCE',
          customer: { id: customerId, name: 'Karim', confidence: 1 },
          confidence: 1,
          sourceText: 'karim balance',
        },
        language: 'en',
        tts,
        formatMoney: formatters.money,
        translate: mockTranslate as unknown as Parameters<typeof answerVoiceQuery>[0]['translate'],
        now: app.ctx.now,
      });

      expect(answer.text).toBe('Karim owes ৳750.');
      expect(answer.spoken).toBe(true);
      expect(answer.amount).toBe(75000);
      expect(tts.lastSpokenText).toBe('Karim owes ৳750.');
    });

    it('answers customer balance query with zero balance', async () => {
      const tts = new FakeTTSEngine();
      const answer = await answerVoiceQuery({
        orm: app.ctx.db.orm,
        query: {
          intent: 'QUERY',
          queryType: 'CUSTOMER_BALANCE',
          customer: { id: customerId, name: 'Karim', confidence: 1 },
          confidence: 1,
          sourceText: 'karim balance',
        },
        language: 'en',
        tts,
        formatMoney: formatters.money,
        translate: mockTranslate as unknown as Parameters<typeof answerVoiceQuery>[0]['translate'],
        now: app.ctx.now,
      });

      expect(answer.text).toBe('Karim has no balance due.');
      expect(tts.lastSpokenText).toBe('Karim has no balance due.');
    });

    it('answers customer balance query when customer is missing', async () => {
      const tts = new FakeTTSEngine();
      const answer = await answerVoiceQuery({
        orm: app.ctx.db.orm,
        query: {
          intent: 'QUERY',
          queryType: 'CUSTOMER_BALANCE',
          customer: null,
          confidence: 0.5,
          sourceText: 'who balance',
        },
        language: 'en',
        tts,
        formatMoney: formatters.money,
        translate: mockTranslate as unknown as Parameters<typeof answerVoiceQuery>[0]['translate'],
      });

      expect(answer.text).toBe('Customer not found.');
    });

    it('answers today sales query when sales are zero', async () => {
      const tts = new FakeTTSEngine();
      const answer = await answerVoiceQuery({
        orm: app.ctx.db.orm,
        query: {
          intent: 'QUERY',
          queryType: 'TODAYS_SALES',
          confidence: 1,
          sourceText: 'today sales',
        },
        language: 'en',
        tts,
        formatMoney: formatters.money,
        translate: mockTranslate as unknown as Parameters<typeof answerVoiceQuery>[0]['translate'],
        now: app.ctx.now,
      });

      expect(answer.text).toBe('No sales recorded yet today.');
      expect(tts.lastSpokenText).toBe('No sales recorded yet today.');
    });
  });

  describe('detectAndSaveCorrections', () => {
    it('records customer and product corrections when draft is changed', async () => {
      const initialDraft: InvoiceDraftShape = {
        customerId: null,
        customerName: 'Karima',
        customerConfidence: 0.6,
        items: [
          {
            key: 'item-1',
            productId: null,
            name: 'Ryce',
            unit: 'bag',
            qtyMilli: 1000,
            unitPrice: 200000,
            confidence: 0.6,
          },
        ],
        discount: 0,
        payment: { type: 'FULL' },
        sourceText: 'one bag of ryce to karima',
      };

      const finalDraft: InvoiceDraftShape = {
        customerId,
        customerName: 'Karim',
        items: [
          {
            key: 'item-1',
            productId,
            name: 'Rice',
            unit: 'bag',
            qtyMilli: 1000,
            unitPrice: 200000,
          },
        ],
        discount: 0,
        payment: { type: 'FULL' },
        sourceText: 'one bag of ryce to karima',
      };

      let count = 0;
      await app.ctx.db.write(async (tx) => {
        count = await detectAndSaveCorrections(
          tx,
          initialDraft,
          finalDraft,
          'en',
          app.ctx.newId,
          app.ctx.now,
        );
      });

      expect(count).toBe(2); // 1 customer + 1 product correction
    });

    it('does not record correction if drafts have identical names', async () => {
      const initialDraft: InvoiceDraftShape = {
        customerId,
        customerName: 'Karim',
        items: [
          {
            key: 'item-1',
            productId,
            name: 'Rice',
            unit: 'bag',
            qtyMilli: 1000,
            unitPrice: 200000,
          },
        ],
        discount: 0,
        payment: { type: 'FULL' },
        sourceText: 'one bag rice to karim',
      };

      let count = 0;
      await app.ctx.db.write(async (tx) => {
        count = await detectAndSaveCorrections(
          tx,
          initialDraft,
          initialDraft,
          'en',
          app.ctx.newId,
          app.ctx.now,
        );
      });

      expect(count).toBe(0);
    });
  });
});
