import { isLocale, LOCALES, otherLocale, preferredLocale } from '../locales';
import { appSignUpPath, isCurrentPage, PAGES, pagePath, switchLocalePath } from '../routes';

describe('locales', () => {
  it('publishes English and Bengali', () => {
    expect(LOCALES).toEqual(['en', 'bn']);
    expect(isLocale('bn')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale('')).toBe(false);
  });

  it('switches between the two languages', () => {
    expect(otherLocale('en')).toBe('bn');
    expect(otherLocale('bn')).toBe('en');
  });

  it.each([
    [['bn-BD', 'en-US'], 'bn'],
    [['BN'], 'bn'],
    [['en-GB', 'bn'], 'en'],
    [['fr-FR', 'bn-IN'], 'bn'],
    [['hi-IN', 'ar'], 'en'],
    [[], 'en'],
  ] as const)('picks a language for browser preferences %j', (languages, expected) => {
    expect(preferredLocale(languages)).toBe(expected);
  });
});

describe('routes', () => {
  it('builds trailing-slash paths for every page', () => {
    expect(pagePath('en', 'home')).toBe('/en/');
    expect(pagePath('bn', 'pricing')).toBe('/bn/pricing/');
    for (const page of Object.keys(PAGES) as (keyof typeof PAGES)[]) {
      expect(pagePath('en', page)).toMatch(/^\/en\/([a-z]+\/)?$/);
    }
  });

  it('points the get-started links at the web app sign-up', () => {
    expect(appSignUpPath('bn')).toBe('/bn/app/?mode=create');
  });

  it.each([
    ['/en/', 'bn', '/bn/'],
    ['/en', 'bn', '/bn/'],
    ['/en/pricing/', 'bn', '/bn/pricing/'],
    ['/bn/faq', 'en', '/en/faq/'],
    ['/', 'bn', '/bn/'],
    ['/pricing/', 'en', '/en/pricing/'],
  ] as const)('switches %s to %s', (pathname, target, expected) => {
    expect(switchLocalePath(pathname, target)).toBe(expected);
  });

  it('recognises the current page with or without a trailing slash', () => {
    expect(isCurrentPage('/en/pricing', '/en/pricing/')).toBe(true);
    expect(isCurrentPage('/en/pricing/', '/en/pricing/')).toBe(true);
    expect(isCurrentPage('/en/', '/en/pricing/')).toBe(false);
    expect(isCurrentPage('/bn/pricing/', '/en/pricing/')).toBe(false);
  });
});
