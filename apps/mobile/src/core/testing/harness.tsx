import { render } from '@testing-library/react-native';
import { type ReactElement } from 'react';

import { type Database, shops, type WriteContext } from '@/core/db';
import { createTestDatabase } from '@/core/db/testing/node-sqlite-driver';
import { initI18n } from '@/core/i18n';
import { type AppServices, AppServicesProvider, loadOrCreateDevice } from '@/core/services';
import { createUuidV7Generator, type LanguageCode } from '@/shared';

// Test-only helpers. Tests run against a real in-memory SQLite database with a controllable
// clock and deterministic IDs; nothing below is mocked.

export interface TestClock {
  now: () => number;
  /** Moves time forward. */
  advance: (ms: number) => void;
  set: (epochMs: number) => void;
}

export function createTestClock(start = Date.UTC(2026, 10, 12, 6, 0, 0)): TestClock {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
    set: (epochMs) => {
      current = epochMs;
    },
  };
}

/** Deterministic, well-distributed bytes (mulberry32), so test IDs are stable across runs. */
export function seededRandomBytes(seed = 1): (length: number) => Uint8Array {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) % 256;
  };
  return (length) => Uint8Array.from({ length }, next);
}

export interface TestApp {
  services: AppServices;
  db: Database;
  clock: TestClock;
  close: () => Promise<void>;
}

/** A started app without a shop: database migrated, device identity created. */
export async function createTestApp(): Promise<TestApp> {
  const db = await createTestDatabase();
  const clock = createTestClock();
  const newId = createUuidV7Generator({ now: clock.now, randomBytes: seededRandomBytes() });
  const device = await loadOrCreateDevice(db, newId);
  return {
    services: { db, now: clock.now, newId, device },
    db,
    clock,
    close: () => db.close(),
  };
}

export interface TestShopApp extends TestApp {
  /** Write context for the test shop, as use cases receive it. */
  ctx: WriteContext;
  shopId: string;
}

/** A started app with one shop ("Rahim Store", BDT, prefix RS), ready for use cases. */
export async function createTestShopApp(language: LanguageCode = 'en'): Promise<TestShopApp> {
  const app = await createTestApp();
  const { services, db, clock } = app;
  const shopId = services.newId();
  await db.write(async (tx) => {
    await tx.orm.insert(shops).values({
      id: shopId,
      shopId,
      createdAt: clock.now(),
      updatedAt: clock.now(),
      deletedAt: null,
      deviceId: services.device.deviceId,
      name: 'Rahim Store',
      address: null,
      phone: null,
      logo: null,
      currencyCode: 'BDT',
      defaultLanguage: language,
      invoicePrefix: 'RS',
    });
    tx.touch('shops');
  });
  const ctx: WriteContext = {
    db,
    now: clock.now,
    newId: services.newId,
    shopId,
    deviceId: services.device.deviceId,
  };
  return { ...app, ctx, shopId };
}

/** Renders a screen or component with the app's providers and translations. */
export async function renderWithApp(
  ui: ReactElement,
  services: AppServices,
  language: LanguageCode = 'en',
): Promise<Awaited<ReturnType<typeof render>>> {
  await initI18n(language);
  return render(<AppServicesProvider services={services}>{ui}</AppServicesProvider>);
}
