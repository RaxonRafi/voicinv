import { eq } from 'drizzle-orm';

import {
  customers,
  invoiceItems,
  invoices,
  ledgerEntries,
  products,
  type ShopRow,
  shops,
} from '@/core/db';
import { createFormatters } from '@/core/i18n';
import { createTestShopApp, type TestShopApp } from '@/core/testing/harness';

import {
  buildReportCsv,
  buildReportHtml,
  calculateDateRange,
  exportReport,
  loadReportData,
} from '../usecases';

describe('reports feature', () => {
  let app: TestShopApp;
  let shop: ShopRow;
  let customerId: string;
  let productId: string;
  const now = Date.UTC(2026, 10, 12, 10, 0, 0);

  beforeEach(async () => {
    app = await createTestShopApp();
    const [loadedShop] = await app.ctx.db.orm.select().from(shops).where(eq(shops.id, app.shopId));
    if (!loadedShop) {
      throw new Error('Test shop not found');
    }
    shop = loadedShop;
    customerId = app.ctx.newId();
    productId = app.ctx.newId();

    await app.ctx.db.write(async (tx) => {
      await tx.orm.insert(customers).values({
        id: customerId,
        shopId: app.shopId,
        name: 'Karim',
        phone: '01711111111',
        notes: '',
        creditLimit: null,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        deviceId: app.ctx.deviceId,
        isDirty: true,
      });

      await tx.orm.insert(products).values({
        id: productId,
        shopId: app.shopId,
        name: 'Basmati Rice',
        unit: 'bag',
        defaultPrice: 300000,
        stockQty: null,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        deviceId: app.ctx.deviceId,
        isDirty: true,
      });

      const invoiceId = app.ctx.newId();
      await tx.orm.insert(invoices).values({
        id: invoiceId,
        shopId: app.shopId,
        invoiceNumber: 'RS-A-000001',
        customerId,
        date: now,
        subtotal: 300000,
        discount: 0,
        total: 300000,
        paidAmount: 200000,
        dueAmount: 100000,
        status: 'ACTIVE',
        sourceText: 'test invoice',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        deviceId: app.ctx.deviceId,
        isDirty: true,
      });

      await tx.orm.insert(invoiceItems).values({
        id: app.ctx.newId(),
        shopId: app.shopId,
        invoiceId,
        productId,
        position: 0,
        nameSnapshot: 'Basmati Rice',
        qtyMilli: 1000,
        unit: 'bag',
        unitPrice: 300000,
        lineTotal: 300000,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        deviceId: app.ctx.deviceId,
        isDirty: true,
      });

      await tx.orm.insert(ledgerEntries).values({
        id: app.ctx.newId(),
        shopId: app.shopId,
        customerId,
        type: 'INVOICE_DUE',
        amount: 100000,
        refId: invoiceId,
        createdAt: now,
        deviceId: app.ctx.deviceId,
        isDirty: true,
      });
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('calculates date ranges for today, week and month', () => {
    const today = calculateDateRange('today', now);
    expect(today.start).toBeLessThan(today.end);

    const week = calculateDateRange('week', now);
    expect(week.start).toBeLessThanOrEqual(today.start);

    const month = calculateDateRange('month', now);
    expect(month.start).toBeLessThanOrEqual(today.start);
  });

  it('fetches sales summary, top products and top debtors', async () => {
    const data = await loadReportData(app.ctx.db.orm, 'today', now);

    expect(data.summary.totalSales).toBe(300000);
    expect(data.summary.totalPaid).toBe(200000);
    expect(data.summary.totalDue).toBe(100000);
    expect(data.summary.invoiceCount).toBe(1);

    expect(data.topProducts).toHaveLength(1);
    expect(data.topProducts[0]?.name).toBe('Basmati Rice');
    expect(data.topProducts[0]?.revenue).toBe(300000);

    expect(data.topDebtors).toHaveLength(1);
    expect(data.topDebtors[0]?.name).toBe('Karim');
    expect(data.topDebtors[0]?.balance).toBe(100000);
  });

  it('builds CSV report with summary and tables', async () => {
    const formatters = createFormatters('en', 'BDT');
    const data = await loadReportData(app.ctx.db.orm, 'today', now);

    const csv = buildReportCsv(data, formatters.money, {
      title: 'Business Report',
      period: 'Period',
      summary: 'Summary',
      totalSales: 'Total Sales',
      totalPaid: 'Collected',
      totalDue: 'Outstanding',
      invoiceCount: 'Invoices',
      topProducts: 'Top Products',
      topDebtors: 'Top Debtors',
    });

    expect(csv).toContain('"Business Report"');
    expect(csv).toContain('Basmati Rice');
    expect(csv).toContain('Karim');
    expect(csv).toContain('01711111111');
  });

  it('builds HTML report containing shop info and data tables', async () => {
    const formatters = createFormatters('en', 'BDT');
    const data = await loadReportData(app.ctx.db.orm, 'today', now);

    const html = buildReportHtml(data, shop, formatters.money, {
      title: 'Business Report',
      today: 'Today',
      totalSales: 'Total Sales',
      totalPaid: 'Collected',
      totalDue: 'Outstanding',
      topProducts: 'Top Products',
      topDebtors: 'Top Debtors',
    });

    expect(html).toContain('Rahim Store');
    expect(html).toContain('Basmati Rice');
    expect(html).toContain('Karim');
  });

  it('exports CSV and PDF via platform share utilities', async () => {
    const formatters = createFormatters('en', 'BDT');
    const data = await loadReportData(app.ctx.db.orm, 'today', now);

    const csvUri = await exportReport(data, 'csv', shop, formatters.money, {
      title: 'Report',
    });
    expect(csvUri).toContain('.csv');

    const pdfUri = await exportReport(data, 'pdf', shop, formatters.money, {
      title: 'Report',
    });
    expect(pdfUri).toContain('.pdf');
  });
});
