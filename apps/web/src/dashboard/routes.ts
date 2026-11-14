import { type Locale } from '@/lib/locales';

// URLs of the signed-in web app. The site is a static export, so record IDs travel in the query
// string (`/en/app/invoices/view/?id=…`) instead of in path segments that would have to be
// known at build time.

export const APP_SCREENS = {
  home: '',
  invoices: 'invoices',
  invoiceNew: 'invoices/new',
  invoiceView: 'invoices/view',
  customers: 'customers',
  customerView: 'customers/view',
  customerEdit: 'customers/edit',
  products: 'products',
  productEdit: 'products/edit',
  paymentNew: 'payments/new',
  reports: 'reports',
  settings: 'settings',
  shopProfile: 'settings/shop',
} as const;

export type AppScreen = keyof typeof APP_SCREENS;

/** Site-relative URL of a screen, with optional query parameters (empty ones are dropped). */
export function appPath(
  locale: Locale,
  screen: AppScreen,
  query: Readonly<Record<string, string | null | undefined>> = {},
): string {
  const segment = APP_SCREENS[screen];
  const base = segment === '' ? `/${locale}/app/` : `/${locale}/app/${segment}/`;
  const search = Object.entries(query)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return search === '' ? base : `${base}?${search}`;
}

/** The screen a pathname belongs to, for marking the current navigation item. */
export function screenOf(pathname: string): AppScreen | null {
  const match = /^\/[a-z]{2}\/app\/?(.*?)\/?$/.exec(pathname);
  if (!match) return null;
  const rest = match[1] ?? '';
  const found = (Object.entries(APP_SCREENS) as [AppScreen, string][]).find(
    ([, segment]) => segment === rest,
  );
  return found ? found[0] : null;
}

/** Top-level section of a screen, for the navigation bar. */
export function sectionOf(screen: AppScreen | null): AppScreen {
  switch (screen) {
    case 'invoices':
    case 'invoiceNew':
    case 'invoiceView':
      return 'invoices';
    case 'customers':
    case 'customerView':
    case 'customerEdit':
    case 'paymentNew':
      return 'customers';
    case 'products':
    case 'productEdit':
      return 'products';
    case 'reports':
      return 'reports';
    case 'settings':
    case 'shopProfile':
      return 'settings';
    default:
      return 'home';
  }
}
