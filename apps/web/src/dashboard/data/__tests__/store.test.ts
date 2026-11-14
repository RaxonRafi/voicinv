import { createUuidV7Generator } from '@/domain';

import { memoryStorage } from '../../api/browser';
import { ApiError } from '../../api/client';
import { FakeApi } from '../../testing/fake-api';
import { createCustomer } from '../catalog';
import { cancelInvoice, createInvoice, type InvoiceInput } from '../invoices';
import { getShop, listCustomers, listInvoices, listProducts } from '../selectors';
import { DomainError } from '../shop-data';
import { DashboardStore, splitChanges } from '../store';

const ACCOUNT = {
  identifier: '+8801712345678',
  password: 'correct horse',
  name: 'Test Store',
  currencyCode: 'BDT',
  language: 'en',
  shopType: 'grocery',
} as const;

const WALK_IN_SALE: InvoiceInput = {
  customerId: null,
  items: [{ productId: null, name: 'Egg', unit: 'piece', qtyMilli: 1000, unitPrice: 10_000 }],
  discount: 0,
  payment: { type: 'FULL' },
  sourceText: null,
};

function browser(server: FakeApi, storage = memoryStorage()) {
  const store = new DashboardStore({
    api: server.client(storage),
    storage,
    now: Date.now,
    newId: createUuidV7Generator(),
    deviceName: 'Web browser',
    sleep: () => Promise.resolve(),
  });
  return { store, storage };
}

const saveSale = (store: DashboardStore, input = WALK_IN_SALE) =>
  store.commit((data, ctx) => createInvoice(data, ctx, input, ctx.nextInvoiceNumber(data)));

describe('DashboardStore', () => {
  it('reports signed out when the browser holds no session', async () => {
    const { store } = browser(new FakeApi());
    await store.start();
    expect(store.getState().phase).toBe('signedOut');
  });

  it('creates an account with its shop record and starter products', async () => {
    const server = new FakeApi();
    const { store } = browser(server);
    const { recoveryCode } = await store.createAccount(ACCOUNT);
    expect(recoveryCode).toMatch(/^[A-Z-]+$/);

    const state = store.getState();
    expect(state).toMatchObject({ phase: 'ready', identifier: ACCOUNT.identifier });
    expect(state.device?.code).toBe('A');
    expect(getShop(state.data)).toMatchObject({ name: 'Test Store', invoicePrefix: 'TS' });
    expect(listProducts(state.data).length).toBeGreaterThan(5);
    // The server holds the same records, so a phone signing in later receives them.
    expect(server.table(state.shopId ?? '', 'shops')).toHaveLength(1);
  });

  it('resumes a stored session after a reload and signs out cleanly', async () => {
    const server = new FakeApi();
    const first = browser(server);
    await first.store.createAccount(ACCOUNT);

    const reloaded = browser(server, first.storage);
    await reloaded.store.start();
    expect(reloaded.store.getState().phase).toBe('ready');
    expect(reloaded.store.getState().device).toEqual(first.store.getState().device);

    await reloaded.store.signOut();
    expect(reloaded.store.getState()).toMatchObject({ phase: 'signedOut', shopId: null });
    expect(reloaded.store.getState().data.products.size).toBe(0);
    expect(reloaded.storage.getItem('vl.session')).toBeNull();
  });

  it('rejects a wrong password and leaves no session behind', async () => {
    const server = new FakeApi();
    await browser(server).store.createAccount(ACCOUNT);
    const other = browser(server);
    await expect(
      other.store.signIn({ identifier: ACCOUNT.identifier, password: 'nope' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(other.storage.getItem('vl.session')).toBeNull();
  });

  it('gives each browser its own invoice numbers and shows the other one’s sales', async () => {
    const server = new FakeApi();
    const shop = browser(server);
    await shop.store.createAccount(ACCOUNT);
    const home = browser(server);
    await home.store.signIn(ACCOUNT);
    expect(home.store.getState().device?.code).toBe('B');

    const first = await saveSale(shop.store);
    const second = await saveSale(shop.store);
    const third = await saveSale(home.store);
    expect([first, second, third].map((invoice) => invoice.invoiceNumber)).toEqual([
      'TS-A-000001',
      'TS-A-000002',
      'TS-B-000001',
    ]);

    // The second browser saw the first one's invoices before saving; the first needs a sync.
    expect(listInvoices(home.store.getState().data)).toHaveLength(3);
    expect(listInvoices(shop.store.getState().data)).toHaveLength(2);
    await shop.store.sync();
    expect(listInvoices(shop.store.getState().data)).toHaveLength(3);
  });

  it('never reuses a number, even after the invoice was cancelled', async () => {
    const server = new FakeApi();
    const { store } = browser(server);
    await store.createAccount(ACCOUNT);
    const invoice = await saveSale(store);
    await store.commit((data, ctx) => cancelInvoice(data, ctx, invoice.id, 'mistake'));
    expect((await saveSale(store)).invoiceNumber).toBe('TS-A-000002');
  });

  it('checks business rules against the latest records, not a stale screen', async () => {
    const server = new FakeApi();
    const shop = browser(server);
    await shop.store.createAccount(ACCOUNT);
    const home = browser(server);
    await home.store.signIn(ACCOUNT);

    const karim = { name: 'Karim', phone: '', notes: '', creditLimit: null, aliases: [] };
    await shop.store.commit((data, ctx) => createCustomer(data, ctx, karim));
    await expect(
      home.store.commit((data, ctx) => createCustomer(data, ctx, karim)),
    ).rejects.toBeInstanceOf(DomainError);
    expect(listCustomers(home.store.getState().data)).toHaveLength(1);
  });

  it('shows nothing that the server did not store', async () => {
    const server = new FakeApi();
    const { store } = browser(server);
    await store.createAccount(ACCOUNT);
    server.offline = true;
    await expect(saveSale(store)).rejects.toBeInstanceOf(ApiError);
    expect(listInvoices(store.getState().data)).toHaveLength(0);

    await store.sync();
    expect(store.getState().errorCode).toBe('NETWORK');
    server.offline = false;
    await store.sync();
    expect(store.getState().errorCode).toBeNull();
  });

  it('retries a push whose answer was lost without creating a second invoice', async () => {
    const server = new FakeApi();
    const { store } = browser(server);
    await store.createAccount(ACCOUNT);

    // The first push is stored, but the browser never hears back.
    server.dropNextPushResponse = true;

    const invoice = await saveSale(store);
    expect(server.dropNextPushResponse).toBe(false);
    expect(server.table(store.getState().shopId ?? '', 'invoices')).toHaveLength(1);
    expect(listInvoices(store.getState().data).map((row) => row.invoice.id)).toEqual([invoice.id]);
  });

  it('sends the user back to sign-in when the session has ended', async () => {
    let clock = 1_800_000_000_000;
    const server = new FakeApi({ accessTtl: 60, now: () => clock });
    const { store, storage } = browser(server);
    await store.createAccount(ACCOUNT);
    // The refresh token is revoked elsewhere (password reset, sign-out on all devices).
    const session = JSON.parse(storage.getItem('vl.session') ?? '{}') as { refreshToken: string };
    server.revoke(session.refreshToken);
    clock += 120_000; // the access token has expired, so the next request must refresh
    await store.sync();
    expect(store.getState().phase).toBe('signedOut');
  });
});

describe('splitChanges', () => {
  it('keeps small pushes whole and splits large ones in table order', () => {
    const record = (id: number) => ({ id: String(id) }) as never;
    const changes = {
      customers: { created: [], updated: [record(1), record(2), record(3)], deleted: [] },
      payments: { created: [record(4), record(5)], updated: [], deleted: [] },
    };
    expect(splitChanges(changes, 10)).toEqual([changes]);
    const batches = splitChanges(changes, 2);
    expect(batches).toHaveLength(3);
    expect(batches[0]?.customers?.updated).toHaveLength(2);
    expect(batches[1]).toMatchObject({
      customers: { updated: [{ id: '3' }] },
      payments: { created: [{ id: '4' }] },
    });
    expect(batches[2]?.payments?.created).toEqual([{ id: '5' }]);
  });
});
