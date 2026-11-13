import { customerAliases, customers, ledgerEntries } from '@/core/db';
import { createTestShopApp, type TestShopApp } from '@/core/testing/harness';

import { listCustomers } from '../repository';
import {
  createCustomer,
  editCustomer,
  getCustomerDetails,
  importCustomers,
  setCustomerArchived,
} from '../usecases';
import { type CustomerInput } from '../types';

const input = (overrides: Partial<CustomerInput> = {}): CustomerInput => ({
  name: 'Karim',
  phone: '',
  notes: '',
  creditLimit: null,
  aliases: [],
  ...overrides,
});

describe('customers', () => {
  let app: TestShopApp;

  beforeEach(async () => {
    app = await createTestShopApp();
  });

  afterEach(() => app.close());

  it('creates a customer, normalizing the phone number and storing aliases', async () => {
    const customer = await createCustomer(
      app.ctx,
      input({
        name: ' Karim  Uddin ',
        phone: '০১৭১২-৩৪৫৬৭৮',
        notes: 'Pays on Fridays',
        creditLimit: 1_000_000,
        aliases: ['করিম', 'Korim'],
      }),
    );

    expect(customer).toMatchObject({
      name: 'Karim Uddin',
      phone: '01712345678',
      notes: 'Pays on Fridays',
      creditLimit: 1_000_000,
      isArchived: false,
      isDirty: true,
    });
    const aliases = await app.db.orm.select().from(customerAliases);
    expect(aliases.map((row) => [row.alias, row.languageCode])).toEqual([
      ['করিম', 'bn'],
      ['Korim', 'en'],
    ]);
  });

  it('stores an empty phone and empty notes as null', async () => {
    expect(await createCustomer(app.ctx, input())).toMatchObject({ phone: null, notes: null });
  });

  it.each(['12ab', '123', '+', '0171234567890123456'])(
    'rejects the phone number "%s"',
    async (phone) => {
      await expect(createCustomer(app.ctx, input({ phone }))).rejects.toMatchObject({
        code: 'invalidPhone',
        field: 'phone',
      });
      expect(await app.db.orm.select().from(customers)).toEqual([]);
    },
  );

  describe('duplicates', () => {
    beforeEach(async () => {
      await createCustomer(app.ctx, input({ name: 'Karim', phone: '01712345678' }));
    });

    it('rejects the same phone number under another name', async () => {
      await expect(
        createCustomer(
          app.ctx,
          input({ name: 'Rahim', phone: '+880 1712 345678'.replace('+880 ', '0') }),
        ),
      ).rejects.toMatchObject({ code: 'duplicateName' });
    });

    it('rejects the same name when no phone number tells them apart', async () => {
      await expect(createCustomer(app.ctx, input({ name: 'karim' }))).rejects.toMatchObject({
        code: 'duplicateName',
      });
    });

    it('allows a second Karim with a different phone number', async () => {
      await expect(
        createCustomer(app.ctx, input({ name: 'Karim', phone: '01812345678' })),
      ).resolves.toMatchObject({ name: 'Karim' });
    });
  });

  it('edits a customer and soft-deletes removed aliases', async () => {
    const customer = await createCustomer(app.ctx, input({ aliases: ['করিম', 'Korim'] }));
    app.clock.advance(1000);

    await editCustomer(
      app.ctx,
      customer.id,
      input({ name: 'Karim Mia', phone: '01712345678', aliases: ['করিম'] }),
    );

    const details = await getCustomerDetails(app.db.orm, customer.id);
    expect(details?.customer).toMatchObject({
      name: 'Karim Mia',
      phone: '01712345678',
      updatedAt: app.clock.now(),
    });
    expect(details?.aliases).toEqual(['করিম']);
    expect(await app.db.orm.select().from(customerAliases)).toHaveLength(2);
    await expect(editCustomer(app.ctx, 'missing', input())).rejects.toMatchObject({
      code: 'notFound',
    });
  });

  it('reports each customer’s balance as the sum of their ledger entries', async () => {
    const karim = await createCustomer(app.ctx, input({ name: 'Karim' }));
    const rahim = await createCustomer(app.ctx, input({ name: 'Rahim' }));
    await app.db.write(async (tx) => {
      const entry = (customerId: string, type: 'INVOICE_DUE' | 'PAYMENT', amount: number) => ({
        id: app.ctx.newId(),
        shopId: app.shopId,
        createdAt: app.clock.now(),
        deviceId: app.ctx.deviceId,
        customerId,
        type,
        amount,
        refId: app.ctx.newId(),
      });
      await tx.orm
        .insert(ledgerEntries)
        .values([
          entry(karim.id, 'INVOICE_DUE', 250_000),
          entry(karim.id, 'PAYMENT', -100_000),
          entry(karim.id, 'INVOICE_DUE', 30_000),
        ]);
    });

    const list = await listCustomers(app.db.orm);
    expect(list.map((row) => [row.customer.name, row.balance])).toEqual([
      ['Karim', 180_000],
      ['Rahim', 0],
    ]);
    expect((await getCustomerDetails(app.db.orm, rahim.id))?.balance).toBe(0);
  });

  it('finds customers by name, phone or alias and hides archived ones', async () => {
    const karim = await createCustomer(
      app.ctx,
      input({ name: 'Karim', phone: '01712345678', aliases: ['করিম'] }),
    );
    await createCustomer(app.ctx, input({ name: 'Rahim', phone: '01899999999' }));

    const names = async (search?: string) =>
      (await listCustomers(app.db.orm, { search })).map((row) => row.customer.name);

    expect(await names()).toEqual(['Karim', 'Rahim']);
    expect(await names('rah')).toEqual(['Rahim']);
    expect(await names('0171')).toEqual(['Karim']);
    expect(await names('করিম')).toEqual(['Karim']);

    await setCustomerArchived(app.ctx, karim.id, true);
    expect(await names()).toEqual(['Rahim']);
    expect(await listCustomers(app.db.orm, { includeArchived: true })).toHaveLength(2);
  });

  it('imports contacts, skipping blanks and people who already exist', async () => {
    await createCustomer(app.ctx, input({ name: 'Karim', phone: '01712345678' }));

    const result = await importCustomers(app.ctx, [
      { name: 'Karim (shop)', phone: '01712-345678' }, // same phone
      { name: 'Rahim', phone: '01899999999' },
      { name: 'rahim' }, // same name, no phone
      { name: '   ' },
      { name: 'Salma Begum', phone: 'not a number' },
      { name: 'Jamal' },
    ]);

    expect(result).toEqual({ added: 3, skipped: 3 });
    const rows = await listCustomers(app.db.orm);
    expect(rows.map((row) => [row.customer.name, row.customer.phone])).toEqual([
      ['Jamal', null],
      ['Karim', '01712345678'],
      ['Rahim', '01899999999'],
      ['Salma Begum', null],
    ]);
  });
});
