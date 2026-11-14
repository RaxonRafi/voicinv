import { isNull } from 'drizzle-orm';

import {
  customers,
  deleteValue,
  invoiceRevisions,
  invoices,
  ledgerEntries,
  payments,
  productAliases,
  products,
  setValue,
  type ShopRow,
  shops,
} from '@/core/db';
import { devicePlatform } from '@/core/platform';
import { type AppServices, saveDeviceCode, SETTINGS } from '@/core/services';
import { runSync, SYNC_SETTINGS, useSyncStore } from '@/core/sync';
import {
  authTokensSchema,
  deviceResponseSchema,
  meResponseSchema,
  type MeResponse,
  recoverResponseSchema,
  registerResponseSchema,
} from '@/shared';

import { AccountError } from './types';

// The optional account (AGENTS.md §1 rule 5): created from the shop already on the phone, so
// nothing is lost and nothing is required. Signing in registers this phone as a device of the
// shop, which gives it its own invoice-number code, and starts sync.

export interface Credentials {
  identifier: string;
  password: string;
}

/** Creates an account for the shop on this phone. Returns the one-time recovery code. */
export async function createAccount(
  services: AppServices,
  shop: ShopRow,
  input: Credentials & { deviceName: string },
): Promise<{ recoveryCode: string }> {
  const { api } = services;
  const response = await api.request(registerResponseSchema, {
    method: 'POST',
    path: '/auth/register',
    auth: false,
    json: {
      identifier: input.identifier,
      password: input.password,
      shop: {
        id: shop.id,
        name: shop.name,
        currencyCode: shop.currencyCode,
        defaultLanguage: shop.defaultLanguage,
        invoicePrefix: shop.invoicePrefix,
      },
    },
  });
  await api.startSession(response);
  await withSessionCleanup(services, async () => {
    const me = await fetchMe(services);
    await finishSignIn(services, me, input.deviceName);
  });
  return { recoveryCode: response.recoveryCode };
}

/**
 * Signs in to an existing account. If the account belongs to another shop, this phone may
 * join it only while it holds no records of its own (a fresh install); otherwise the two
 * shops' records would be mixed, so sign-in is refused with `DIFFERENT_SHOP`.
 */
export async function signIn(
  services: AppServices,
  shop: ShopRow,
  input: Credentials & { deviceName: string },
): Promise<void> {
  const { api } = services;
  const tokens = await api.request(authTokensSchema, {
    method: 'POST',
    path: '/auth/login',
    auth: false,
    json: { identifier: input.identifier, password: input.password },
  });
  await api.startSession(tokens);
  await withSessionCleanup(services, async () => {
    const me = await fetchMe(services);
    if (me.shop.id !== shop.id) await joinAccountShop(services, me);
    await finishSignIn(services, me, input.deviceName);
  });
}

/** Signs out. The records stay on the phone; sync stops until the next sign-in. */
export async function signOut(services: AppServices): Promise<void> {
  await services.api.endSession();
  await services.db.write(async (tx) => {
    await deleteValue(tx, SYNC_SETTINGS.cursor);
    await deleteValue(tx, SYNC_SETTINGS.accountIdentifier);
    await deleteValue(tx, SYNC_SETTINGS.lastSyncedAt);
  });
  useSyncStore.setState({
    signedIn: false,
    identifier: null,
    status: 'idle',
    errorCode: null,
    lastSyncedAt: null,
  });
}

/** Sets a new password with the recovery code. Returns the new recovery code to write down. */
export async function recoverPassword(
  services: AppServices,
  input: { identifier: string; recoveryCode: string; newPassword: string },
): Promise<{ recoveryCode: string }> {
  return services.api.request(recoverResponseSchema, {
    method: 'POST',
    path: '/auth/recover',
    auth: false,
    json: input,
  });
}

function fetchMe(services: AppServices): Promise<MeResponse> {
  return services.api.request(meResponseSchema, { method: 'GET', path: '/me' });
}

/** If anything after sign-in fails, the half-made session is dropped again. */
async function withSessionCleanup(services: AppServices, work: () => Promise<void>) {
  try {
    await work();
  } catch (error) {
    await services.api.endSession();
    throw error;
  }
}

async function finishSignIn(services: AppServices, me: MeResponse, deviceName: string) {
  const device = await services.api.request(deviceResponseSchema, {
    method: 'POST',
    path: '/devices',
    json: { id: services.device.deviceId, name: deviceName, platform: devicePlatform() },
  });
  await saveDeviceCode(services.db, device.deviceCode);
  // Invoice numbering reads the stored code; the in-memory identity is kept in step for display.
  services.device.deviceCode = device.deviceCode;
  await services.db.write((tx) =>
    setValue(tx, SYNC_SETTINGS.accountIdentifier, me.user.identifier),
  );
  useSyncStore.setState({ signedIn: true, identifier: me.user.identifier, errorCode: null });
  // In the background: the user can keep working while the first sync runs.
  void runSync(services);
}

/** True when the phone holds customers or any financial record. */
async function hasOwnRecords(services: AppServices): Promise<boolean> {
  const { orm } = services.db;
  for (const table of [customers, invoices, payments, ledgerEntries, invoiceRevisions]) {
    if ((await orm.select({ id: table.id }).from(table).limit(1)).length > 0) return true;
  }
  return false;
}

/**
 * Replaces the shop created during onboarding with the account's shop. Only allowed without
 * records of its own; template products from onboarding are dropped, since the account's
 * products arrive with the first sync.
 */
async function joinAccountShop(services: AppServices, me: MeResponse): Promise<void> {
  if (await hasOwnRecords(services)) throw new AccountError('DIFFERENT_SHOP');
  const now = services.now();
  await services.db.write(async (tx) => {
    await tx.orm.delete(productAliases);
    await tx.orm.delete(products);
    await tx.orm.delete(shops).where(isNull(shops.deletedAt));
    // A placeholder from `/me` until the first sync brings the full profile. Not dirty: it
    // must never overwrite the server's version.
    await tx.orm.insert(shops).values({
      id: me.shop.id,
      shopId: me.shop.id,
      createdAt: now,
      updatedAt: 0,
      deletedAt: null,
      deviceId: services.device.deviceId,
      isDirty: false,
      name: me.shop.name,
      address: null,
      phone: null,
      logo: null,
      currencyCode: me.shop.currencyCode,
      defaultLanguage: me.shop.defaultLanguage,
      invoicePrefix: me.shop.invoicePrefix,
    });
    await deleteValue(tx, SYNC_SETTINGS.cursor);
    await deleteValue(tx, SETTINGS.invoiceSequence);
    tx.touch('shops', 'products', 'productAliases');
  });
}
