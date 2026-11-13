import { isLocale, type Locale } from './locales';

/** Marketing pages and their URL segment under `/<locale>/`. */
export const PAGES = {
  home: '',
  features: 'features',
  pricing: 'pricing',
  download: 'download',
  faq: 'faq',
  privacy: 'privacy',
  terms: 'terms',
} as const;

export type PageKey = keyof typeof PAGES;

/** Id of the waitlist section on the home page. */
export const WAITLIST_ANCHOR = 'waitlist';

/** Site-relative URL of a page. The site is exported with trailing slashes. */
export function pagePath(locale: Locale, page: PageKey): string {
  const segment = PAGES[page];
  return segment === '' ? `/${locale}/` : `/${locale}/${segment}/`;
}

export function waitlistPath(locale: Locale): string {
  return `${pagePath(locale, 'home')}#${WAITLIST_ANCHOR}`;
}

/** The same page in another language, e.g. `/en/pricing/` → `/bn/pricing/`. */
export function switchLocalePath(pathname: string, target: Locale): string {
  const segments = pathname.split('/').filter((segment) => segment.length > 0);
  const [first, ...rest] = segments;
  const tail = first !== undefined && isLocale(first) ? rest : segments;
  return `/${[target, ...tail].join('/')}/`;
}

/** Whether `pathname` is the given page, ignoring a missing or extra trailing slash. */
export function isCurrentPage(pathname: string, href: string): boolean {
  const normalize = (path: string) => path.replace(/\/+$/, '');
  return normalize(pathname) === normalize(href);
}
