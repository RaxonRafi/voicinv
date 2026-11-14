'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { ZodError } from 'zod';

import { type AppContent, getAppContent } from '@/content';
import { createUuidV7Generator, type Shop } from '@/domain';
import { fill } from '@/lib/format';
import { type Locale } from '@/lib/locales';
import { API_BASE_URL } from '@/lib/site-config';

import {
  browserStorage,
  exclusiveAcrossTabs,
  type KeyValueStorage,
  storedSessions,
} from './api/browser';
import { ApiClient, ApiError } from './api/client';
import { getShop } from './data/selectors';
import { DomainError } from './data/shop-data';
import { type DashboardState, DashboardStore } from './data/store';
import { createFormatters, type Formatters } from './format';
import { appPath, type AppScreen } from './routes';

// Everything a screen needs, provided once for the whole web app: the store with the shop's
// records, the copy in the visitor's language and the formatters for the shop's currency.

interface Services {
  store: DashboardStore;
  storage: KeyValueStorage;
}

const ServicesContext = createContext<Services | null>(null);
const LocaleContext = createContext<Locale>('en');

/** How often records changed on phones are fetched while the page is visible. */
const SYNC_INTERVAL_MS = 30_000;

export function DashboardProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const [services] = useState<Services>(() => {
    const storage = browserStorage();
    const api = new ApiClient({
      baseUrl: API_BASE_URL,
      sessions: storedSessions(storage),
      exclusive: exclusiveAcrossTabs,
    });
    const store = new DashboardStore({
      api,
      storage,
      now: Date.now,
      newId: createUuidV7Generator(),
      deviceName: getAppContent(locale).auth.deviceName,
    });
    return { store, storage };
  });
  const { store } = services;

  useEffect(() => {
    void store.start();
    const syncIfVisible = () => {
      if (document.visibilityState === 'visible') void store.sync();
    };
    const onStorage = (event: StorageEvent) => store.sessionChanged(event.key);
    const timer = window.setInterval(syncIfVisible, SYNC_INTERVAL_MS);
    window.addEventListener('focus', syncIfVisible);
    window.addEventListener('online', syncIfVisible);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', syncIfVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', syncIfVisible);
      window.removeEventListener('online', syncIfVisible);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', syncIfVisible);
    };
  }, [store]);

  return (
    <ServicesContext.Provider value={services}>
      <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
    </ServicesContext.Provider>
  );
}

function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('DashboardProvider is missing');
  return services;
}

export function useDashboardState(): DashboardState {
  const { store } = useServices();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

export interface AppHelpers {
  locale: Locale;
  t: AppContent;
  store: DashboardStore;
  storage: KeyValueStorage;
  state: DashboardState;
  shop: Shop | null;
  fmt: Formatters;
  /** URL of a screen in the current language. */
  path(screen: AppScreen, query?: Readonly<Record<string, string | null | undefined>>): string;
  /** Fills `{placeholders}` of a translated string. */
  fill: typeof fill;
}

export function useApp(): AppHelpers {
  const { store, storage } = useServices();
  const locale = useContext(LocaleContext);
  const state = useDashboardState();
  const shop = useMemo(() => getShop(state.data), [state.data]);
  const currency = shop?.currencyCode ?? 'BDT';
  const fmt = useMemo(() => createFormatters(locale, currency), [locale, currency]);
  return {
    locale,
    t: getAppContent(locale),
    store,
    storage,
    state,
    shop,
    fmt,
    path: (screen, query) => appPath(locale, screen, query),
    fill,
  };
}

// The current time, for "today" on screens. Refreshed every minute, so a page left open past
// midnight moves on to the new day; reading it during render stays pure.
let clock = Date.now();
const clockListeners = new Set<() => void>();
let clockTimer: number | null = null;

export function useNow(): number {
  return useSyncExternalStore(
    (listener) => {
      clockListeners.add(listener);
      clockTimer ??= window.setInterval(() => {
        clock = Date.now();
        for (const notify of clockListeners) notify();
      }, 60_000);
      return () => {
        clockListeners.delete(listener);
        if (clockListeners.size === 0 && clockTimer !== null) {
          window.clearInterval(clockTimer);
          clockTimer = null;
        }
      };
    },
    () => clock,
    () => clock,
  );
}

/** Whether the browser says it is connected. Saving needs the server, so this matters. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (listener) => {
      window.addEventListener('online', listener);
      window.addEventListener('offline', listener);
      return () => {
        window.removeEventListener('online', listener);
        window.removeEventListener('offline', listener);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

export interface ErrorText {
  message: string;
  /** Form field at fault, when the problem belongs to one. */
  field?: string;
}

/** Turns anything a save can throw into words for the user, and the field to point at. */
export function describeError(error: unknown, t: AppContent): ErrorText {
  if (error instanceof DomainError) {
    const messages = t.errors as unknown as Readonly<Record<string, string | undefined>>;
    const message = messages[error.code];
    return {
      message: typeof message === 'string' ? message : t.errors.invalid,
      field: error.field,
    };
  }
  if (error instanceof ZodError) {
    const [issue] = error.issues;
    const messages = t.errors as unknown as Readonly<Record<string, string | undefined>>;
    const field = typeof issue?.path[0] === 'string' ? issue.path[0] : undefined;
    const message = issue ? messages[issue.message] : undefined;
    return { message: typeof message === 'string' ? message : t.errors.invalid, field };
  }
  if (error instanceof ApiError) {
    const messages: Readonly<Record<string, string>> = t.errors.api;
    const code = error.status === 0 ? 'NETWORK' : error.code;
    return { message: messages[code] ?? t.errors.api.generic };
  }
  return { message: t.common.somethingWrong };
}
