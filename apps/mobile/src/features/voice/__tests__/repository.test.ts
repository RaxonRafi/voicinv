import {
  customerAliases,
  customers,
  invoices,
  ledgerEntries,
  productAliases,
  products,
} from '@/core/db';
import { createTestShopApp, type TestShopApp } from '@/core/testing/harness';

import {
  getCorrections,
  getCustomerBalance,
  getTodaySalesTotal,
  loadParserContext,
  recordCorrection,
} from '../repository';

describe('voice repository', () => {
  let app: TestShopApp;

  beforeEach(async () => {
    app = await createTestShopApp();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('corrections', () => {
    it('records a new correction and increments count on repeated correction', async () => {
      await app.ctx.db.write(async (tx) => {
        await recordCorrection(
          tx,
          {
            heardText: 'Karima',
            correctedText: 'Karim',
            fieldType: 'customer',
            languageCode: 'en',
          },
          app.ctx.newId,
          app.ctx.now,
        );
      });

      let list = await getCorrections(app.ctx.db.orm, 'en');
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        heardText: 'Karima',
        correctedText: 'Karim',
        fieldType: 'customer',
        count: 1,
      });

      // Repeat same correction
      await app.ctx.db.write(async (tx) => {
        await recordCorrection(
          tx,
          {
            heardText: 'Karima',
            correctedText: 'Karim',
            fieldType: 'customer',
            languageCode: 'en',
          },
          app.ctx.newId,
          app.ctx.now,
        );
      });

      list = await getCorrections(app.ctx.db.orm, 'en');
      expect(list).toHaveLength(1);
      expect(list[0]?.count).toBe(2);
    });

    it('ignores empty strings or identical heard and corrected text', async () => {
      await app.ctx.db.write(async (tx) => {
        await recordCorrection(
          tx,
          {
            heardText: 'Rice',
            correctedText: 'Rice',
            fieldType: 'product',
            languageCode: 'en',
          },
          app.ctx.newId,
          app.ctx.now,
        );
        await recordCorrection(
          tx,
          {
            heardText: '  ',
            correctedText: 'Oil',
            fieldType: 'product',
            languageCode: 'en',
          },
          app.ctx.newId,
          app.ctx.now,
        );
      });

      const list = await getCorrections(app.ctx.db.orm, 'en');
      expect(list).toHaveLength(0);
    });

    it('filters corrections by language', async () => {
      await app.ctx.db.write(async (tx) => {
        await recordCorrection(
          tx,
          {
            heardText: 'চালা',
            correctedText: 'চাল',
            fieldType: 'product',
            languageCode: 'bn',
          },
          app.ctx.newId,
          app.ctx.now,
        );
      });

      const bnList = await getCorrections(app.ctx.db.orm, 'bn');
      const enList = await getCorrections(app.ctx.db.orm, 'en');

      expect(bnList).toHaveLength(1);
      expect(enList).toHaveLength(0);
    });
  });

  describe('financial queries', () => {
    it('calculates customer balance from ledger entries', async () => {
      const customerId = app.ctx.newId();
      await app.ctx.db.write(async (tx) => {
        await tx.orm.insert(customers).values({
          id: customerId,
          shopId: app.shopId,
          name: 'Rahim',
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

        await tx.orm.insert(ledgerEntries).values([
          {
            id: app.ctx.newId(),
            shopId: app.shopId,
            customerId,
            type: 'INVOICE_DUE',
            amount: 50000, // 500 taka
            refId: 'inv-1',
            createdAt: app.ctx.now(),
            deviceId: app.ctx.deviceId,
            isDirty: true,
          },
          {
            id: app.ctx.newId(),
            shopId: app.shopId,
            customerId,
            type: 'PAYMENT',
            amount: -20000, // 200 taka paid
            refId: 'pay-1',
            createdAt: app.ctx.now(),
            deviceId: app.ctx.deviceId,
            isDirty: true,
          },
        ]);
      });

      const balance = await getCustomerBalance(app.ctx.db.orm, customerId);
      expect(balance).toBe(30000); // 300 taka remaining due
    });

    it('calculates total sales for today from active invoices', async () => {
      const now = app.ctx.now();
      const startOfDay = now - 1000;
      const endOfDay = now + 1000;

      await app.ctx.db.write(async (tx) => {
        await tx.orm.insert(invoices).values([
          {
            id: app.ctx.newId(),
            shopId: app.shopId,
            invoiceNumber: 'RS-A-000001',
            customerId: null,
            date: now,
            subtotal: 100000,
            discount: 0,
            total: 100000,
            paidAmount: 100000,
            dueAmount: 0,
            status: 'ACTIVE',
            sourceText: 'cash sale',
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            deviceId: app.ctx.deviceId,
            isDirty: true,
          },
          {
            id: app.ctx.newId(),
            shopId: app.shopId,
            invoiceNumber: 'RS-A-000002',
            customerId: null,
            date: now,
            subtotal: 50000,
            discount: 0,
            total: 50000,
            paidAmount: 50000,
            dueAmount: 0,
            status: 'CANCELLED', // Cancelled should be ignored
            sourceText: 'cancelled sale',
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            deviceId: app.ctx.deviceId,
            isDirty: true,
          },
        ]);
      });

      const total = await getTodaySalesTotal(app.ctx.db.orm, startOfDay, endOfDay);
      expect(total).toBe(100000);
    });
  });

  describe('loadParserContext', () => {
    it('loads active customers, products, aliases and learned corrections', async () => {
      const customerId = app.ctx.newId();
      const productId = app.ctx.newId();

      await app.ctx.db.write(async (tx) => {
        await tx.orm.insert(customers).values({
          id: customerId,
          shopId: app.shopId,
          name: 'Karim Uddin',
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

        await tx.orm.insert(customerAliases).values({
          id: app.ctx.newId(),
          shopId: app.shopId,
          customerId,
          alias: 'করিম',
          languageCode: 'bn',
          createdAt: app.ctx.now(),
          updatedAt: app.ctx.now(),
          deletedAt: null,
          deviceId: app.ctx.deviceId,
          isDirty: true,
        });

        await tx.orm.insert(products).values({
          id: productId,
          shopId: app.shopId,
          name: 'Miniket Rice',
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

        await tx.orm.insert(productAliases).values({
          id: app.ctx.newId(),
          shopId: app.shopId,
          productId,
          alias: 'মিনিকেট চাল',
          languageCode: 'bn',
          createdAt: app.ctx.now(),
          updatedAt: app.ctx.now(),
          deletedAt: null,
          deviceId: app.ctx.deviceId,
          isDirty: true,
        });

        await recordCorrection(
          tx,
          {
            heardText: 'Minikot',
            correctedText: 'Miniket Rice',
            fieldType: 'product',
            languageCode: 'en',
          },
          app.ctx.newId,
          app.ctx.now,
        );
      });

      const context = await loadParserContext(app.ctx.db.orm, 'en');
      expect(context.customers).toHaveLength(1);
      expect(context.customers[0]).toMatchObject({
        name: 'Karim Uddin',
        aliases: ['করিম'],
      });

      expect(context.products).toHaveLength(1);
      expect(context.products[0]).toMatchObject({
        name: 'Miniket Rice',
        unit: 'bag',
        defaultPrice: 250000,
        aliases: ['মিনিকেট চাল'],
      });

      expect(context.corrections).toHaveLength(1);
      expect(context.corrections?.[0]).toMatchObject({
        heardText: 'Minikot',
        correctedText: 'Miniket Rice',
      });
    });
  });
});

