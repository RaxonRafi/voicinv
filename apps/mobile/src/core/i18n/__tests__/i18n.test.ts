import { createFormatters, isLanguage, resolveLanguage, scriptOf } from '../index';
import { bn, en } from '../locales';

type Leaf = readonly [path: string, value: string];

function leaves(value: unknown, path = ''): Leaf[] {
  if (typeof value === 'string') return [[path, value]];
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, child]) =>
      leaves(child, path === '' ? key : `${path}.${key}`),
    );
  }
  throw new Error(`Unexpected ${typeof value} in translations at "${path}"`);
}

const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

const english = leaves(en);
const bengali = leaves(bn);
const bengaliByPath = new Map(bengali);

/** Strings that are legitimately the same in both languages. */
const SHARED = new Set(['common.appName', 'settings.languages.en', 'settings.languages.bn']);

describe('translations', () => {
  it('have exactly the same keys in English and Bengali', () => {
    expect(bengali.map(([path]) => path).sort()).toEqual(english.map(([path]) => path).sort());
  });

  it('have no empty or untrimmed strings', () => {
    const offenders = [...english, ...bengali]
      .filter(([, value]) => value.trim() === '' || value !== value.trim())
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('use the same placeholders in both languages', () => {
    const offenders = english
      .filter(
        ([path, value]) =>
          placeholders(bengaliByPath.get(path) ?? '').join() !== placeholders(value).join(),
      )
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('are really translated: Bengali strings are written in Bengali script', () => {
    const offenders = bengali
      .filter(([path, value]) => !SHARED.has(path) && !/[ঀ-৿]/.test(value))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('keep English strings free of Bengali script', () => {
    const offenders = english
      .filter(([path, value]) => !SHARED.has(path) && /[ঀ-৿]/.test(value))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});

describe('language selection', () => {
  it('prefers the saved choice, then the device language, then English', () => {
    expect(resolveLanguage('bn', ['en'])).toBe('bn');
    expect(resolveLanguage(null, ['fr', 'bn', 'en'])).toBe('bn');
    expect(resolveLanguage('fr', ['hi', null])).toBe('en');
    expect(resolveLanguage(null, [])).toBe('en');
    expect(isLanguage('bn')).toBe(true);
    expect(isLanguage('fr')).toBe(false);
    expect(isLanguage(undefined)).toBe(false);
  });

  it('maps each language to its writing system', () => {
    expect(scriptOf('bn')).toBe('bengali');
    expect(scriptOf('en')).toBe('latin');
  });
});

describe('createFormatters', () => {
  it('formats money, numbers and quantities in the interface language', () => {
    const english = createFormatters('en', 'BDT');
    expect(english.money(250_050)).toBe('৳2,500.50');
    expect(english.amount(250_050)).toBe('2,500.50');
    expect(english.integer(1234)).toBe('1,234');
    expect(english.quantity(1500)).toBe('1.5');

    const bengali = createFormatters('bn', 'BDT');
    expect(bengali.money(500_000)).toBe('৫,০০০৳');
    expect(bengali.quantity(2000)).toBe('২');
    expect(bengali.date(Date.UTC(2026, 10, 12, 6))).toMatch(/২০২৬/);
  });
});
