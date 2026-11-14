import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { customers, invoices, ledgerEntries, products, type ShopRow, shops } from '@/core/db';
import { findCurrentShop, writeContextFor } from '@/core/services';
import { INITIAL_SYNC_STATE, runSync, useSyncStore } from '@/core/sync';
import { FakeApi } from '@/core/testing/fake-api';
import { createTestShopApp, renderWithApp, type TestShopApp } from '@/core/testing/harness';
import { createCustomer } from '@/features/customers';
import { createInvoice } from '@/features/invoices';
import { getBalance, recordPayment } from '@/features/ledger';

import { AccountScreen } from '../screens/account-screen';
import { AccountError } from '../types';
import { createAccount, signIn, signOut } from '../usecases';

const OWNER = { identifier: 'rahim@example.com', password: 'password123', deviceName: 'Phone' };

async function phone(fake: FakeApi, seed: number): Promise<TestShopApp> {
  const app = await createTestShopApp('en', seed);
  app.services.api = fake.client();
  return app;
}

async function currentShop(app: TestShopApp): Promise<ShopRow> {
  const shop = await findCurrentShop(app.db.orm);
  if (!shop) throw new Error('no shop');
  return shop;
}

describe('account and multi-device sync', () => {
  let fake: FakeApi;
  let phoneA: TestShopApp;
  let phoneB: TestShopApp;

  beforeEach(async () => {
    useSyncStore.setState(INITIAL_SYNC_STATE);
    fake = new FakeApi();
    phoneA = await phone(fake, 1);
    phoneB = await phone(fake, 2);
  });

  afterEach(async () => {
    await phoneA.close();
    await phoneB.close();
  });

  it('creates the account from the shop on the phone and keeps its records', async () => {
    await createCustomer(phoneA.ctx, {
      name: 'Karim',
      phone: '',
      notes: '',
      creditLimit: null,
      aliases: [],
    });

    const { recoveryCode } = await createAccount(phoneA.services, await currentShop(phoneA), OWNER);
    await runSync(phoneA.services);

    expect(recoveryCode).toMatch(/^[A-Z0-9-]+$/);
    expect(fake.accounts[0]?.shopId).toBe(phoneA.shopId);
    expect(fake.devices.get(phoneA.shopId)?.get(phoneA.services.device.deviceId)).toBe('A');
    expect(fake.table(phoneA.shopId, 'customers')).toEqual([
      expect.objectContaining({ name: 'Karim' }),
    ]);
    expect(useSyncStore.getState()).toMatchObject({
      signedIn: true,
      identifier: OWNER.identifier,
    });
  });

  it('gives a second phone the same records, and sends its changes back', async () => {
    // Phone A: a customer buys on credit.
    const karim = await createCustomer(phoneA.ctx, {
      name: 'Karim',
      phone: '',
      notes: '',
      creditLimit: null,
      aliases: [],
    });
    await createInvoice(phoneA.ctx, {
      customerId: karim.id,
      items: [{ productId: null, name: 'Rice', unit: 'bag', qtyMilli: 2000, unitPrice: 250_000 }],
      discount: 0,
      payment: { type: 'NONE' },
      sourceText: null,
    });
    await createAccount(phoneA.services, await currentShop(phoneA), OWNER);
    await runSync(phoneA.services);

    // Phone B: a fresh install signs in to the same account.
    await signIn(phoneB.services, await currentShop(phoneB), OWNER);
    await runSync(phoneB.services);

    const shopOnB = await currentShop(phoneB);
    expect(shopOnB.id).toBe(phoneA.shopId);
    expect(await phoneB.db.orm.select().from(shops)).toHaveLength(1);
    expect(await phoneB.db.orm.select().from(invoices)).toHaveLength(1);
    expect(await getBalance(phoneB.db.orm, karim.id)).toBe(500_000);
    expect(await getBalance(phoneB.db.orm, karim.id)).toBe(
      await getBalance(phoneA.db.orm, karim.id),
    );
    // Phone B has its own invoice-number code, so offline invoices never collide.
    expect(fake.devices.get(phoneA.shopId)?.get(phoneB.services.device.deviceId)).toBe('B');

    // Phone B records a payment; phone A receives it.
    const ctxB = writeContextFor(phoneB.services, shopOnB.id);
    await recordPayment(ctxB, { customerId: karim.id, amount: 200_000, note: '', invoiceId: null });
    await runSync(phoneB.services);
    await runSync(phoneA.services);

    expect(await getBalance(phoneA.db.orm, karim.id)).toBe(300_000);
    const entriesA = await phoneA.db.orm.select().from(ledgerEntries);
    const entriesB = await phoneB.db.orm.select().from(ledgerEntries);
    expect(entriesA.map((entry) => entry.id).sort()).toEqual(
      entriesB.map((entry) => entry.id).sort(),
    );
  });

  it('numbers invoices after the ones already received, never reusing a number', async () => {
    await createAccount(phoneA.services, await currentShop(phoneA), OWNER);
    await signIn(phoneB.services, await currentShop(phoneB), OWNER);
    const ctxB = writeContextFor(phoneB.services, phoneA.shopId);
    const sale = {
      customerId: null,
      items: [{ productId: null, name: 'Oil', unit: 'litre', qtyMilli: 1000, unitPrice: 20_000 }],
      discount: 0,
      payment: { type: 'FULL' as const },
      sourceText: null,
    };
    await createInvoice(ctxB, sale);
    await runSync(phoneB.services);

    // Phone B is reinstalled under the same device code: the counter is gone, the invoice is not.
    await phoneB.db.write((tx) => tx.execute(`DELETE FROM kv WHERE key = 'invoice.sequence'`));
    const next = await createInvoice(ctxB, sale);

    expect(next.invoiceNumber).toBe('RS-B-000002');
  });

  it('refuses to mix two shops when the phone already has its own records', async () => {
    await createAccount(phoneA.services, await currentShop(phoneA), OWNER);
    await createCustomer(phoneB.ctx, {
      name: 'Someone',
      phone: '',
      notes: '',
      creditLimit: null,
      aliases: [],
    });

    const error = await signIn(phoneB.services, await currentShop(phoneB), OWNER).catch((e) => e);

    expect(error).toBeInstanceOf(AccountError);
    expect(error).toMatchObject({ code: 'DIFFERENT_SHOP' });
    expect(await phoneB.services.api.hasSession()).toBe(false);
    expect((await currentShop(phoneB)).id).toBe(phoneB.shopId);
  });

  it('drops onboarding template products when joining the account shop', async () => {
    await createAccount(phoneA.services, await currentShop(phoneA), OWNER);
    await phoneB.db.write((tx) =>
      tx.orm.insert(products).values({
        id: phoneB.services.newId(),
        shopId: phoneB.shopId,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
        deviceId: phoneB.services.device.deviceId,
        name: 'Template rice',
        unit: 'kg',
        defaultPrice: null,
        stockQty: null,
        isArchived: false,
      }),
    );

    await signIn(phoneB.services, await currentShop(phoneB), OWNER);

    expect(await phoneB.db.orm.select().from(products)).toHaveLength(0);
  });

  it('signs out but keeps every record on the phone', async () => {
    await createCustomer(phoneA.ctx, {
      name: 'Karim',
      phone: '',
      notes: '',
      creditLimit: null,
      aliases: [],
    });
    await createAccount(phoneA.services, await currentShop(phoneA), OWNER);

    await signOut(phoneA.services);

    expect(await phoneA.services.api.hasSession()).toBe(false);
    expect(useSyncStore.getState()).toMatchObject({ signedIn: false, identifier: null });
    expect(await phoneA.db.orm.select().from(customers)).toHaveLength(1);
  });

  it('shows the sign-in error for a wrong password', async () => {
    await createAccount(phoneA.services, await currentShop(phoneA), OWNER);
    // Both test phones share one sync store; let phone A's background sync finish first.
    await runSync(phoneA.services);
    useSyncStore.setState({ signedIn: false });

    await renderWithApp(<AccountScreen />, phoneB.services);
    await fireEvent.changeText(await screen.findByTestId('account-identifier'), OWNER.identifier);
    await fireEvent.changeText(screen.getByTestId('account-password'), 'wrong password');
    await fireEvent.press(screen.getByTestId('account-submit'));

    expect(await screen.findByText('Wrong phone number, email or password.')).toBeOnTheScreen();
  });

  it('shows the recovery code once after creating an account', async () => {
    useSyncStore.setState({ signedIn: false });

    await renderWithApp(<AccountScreen />, phoneA.services);
    await fireEvent.press(await screen.findByTestId('account-mode-create'));
    await fireEvent.changeText(screen.getByTestId('account-identifier'), OWNER.identifier);
    await fireEvent.changeText(screen.getByTestId('account-password'), OWNER.password);
    await fireEvent.press(screen.getByTestId('account-submit'));

    expect(await screen.findByTestId('account-recovery-value')).toHaveTextContent(
      'ABCD-EFGH-JKMN-PQRS',
    );
    await fireEvent.press(screen.getByText('I wrote it down'));
    await waitFor(() => expect(screen.getByTestId('account-sync-now')).toBeOnTheScreen());
  });
});
