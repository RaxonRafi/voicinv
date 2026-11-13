import { isNull } from 'drizzle-orm';
import { createContext, type ReactNode, use } from 'react';

import { type ApiClient } from '@/core/api';
import {
  type Database,
  DatabaseProvider,
  type Orm,
  type ShopRow,
  shops,
  useLiveQuery,
  type WriteContext,
} from '@/core/db';

import { type Formatters, useFormatters } from '@/core/i18n';
import { DEFAULT_CURRENCY } from '@/shared';

import { type DeviceIdentity } from './device';

/** Long-lived services created once at startup and shared by every feature. */
export interface AppServices {
  db: Database;
  now: () => number;
  newId: () => string;
  device: DeviceIdentity;
  /** Our backend, for the optional account features only. Never needed by the core loop. */
  api: ApiClient;
}

const ServicesContext = createContext<AppServices | null>(null);

interface AppServicesProviderProps {
  services: AppServices;
  children: ReactNode;
}

export function AppServicesProvider({ services, children }: AppServicesProviderProps) {
  return (
    <ServicesContext value={services}>
      <DatabaseProvider database={services.db}>{children}</DatabaseProvider>
    </ServicesContext>
  );
}

export function useServices(): AppServices {
  const services = use(ServicesContext);
  if (!services) throw new Error('useServices must be used inside <AppServicesProvider>');
  return services;
}

/** The shop on this device. v1 has exactly one; it is created during onboarding. */
export async function findCurrentShop(orm: Orm): Promise<ShopRow | null> {
  const rows = await orm.select().from(shops).where(isNull(shops.deletedAt)).limit(1);
  return rows[0] ?? null;
}

export type CurrentShopState =
  { status: 'loading' } | { status: 'none' } | { status: 'ready'; shop: ShopRow };

/** The current shop, kept up to date. `none` means onboarding has not been completed. */
export function useCurrentShop(): CurrentShopState {
  const query = useLiveQuery('current-shop', ['shops'], findCurrentShop);
  if (query.status === 'ready') {
    return query.data ? { status: 'ready', shop: query.data } : { status: 'none' };
  }
  // A failed read is treated as loading; the root error boundary reports real database errors.
  return { status: 'loading' };
}

/** Builds the context use cases need to write records for the given shop. */
export function writeContextFor(services: AppServices, shopId: string): WriteContext {
  return {
    db: services.db,
    now: services.now,
    newId: services.newId,
    shopId,
    deviceId: services.device.deviceId,
  };
}

export interface ShopContext {
  shop: ShopRow;
  /** For use cases that write records of this shop. */
  ctx: WriteContext;
  /** Number, money and date formatters for the interface language and the shop's currency. */
  format: Formatters;
}

/**
 * What a screen needs once a shop exists: the shop, a write context and formatters.
 * Returns null while the shop is loading (screens show a spinner) or before onboarding.
 */
export function useShopContext(): ShopContext | null {
  const services = useServices();
  const current = useCurrentShop();
  const currency = current.status === 'ready' ? current.shop.currencyCode : DEFAULT_CURRENCY;
  const format = useFormatters(currency);
  if (current.status !== 'ready') return null;
  return { shop: current.shop, ctx: writeContextFor(services, current.shop.id), format };
}
