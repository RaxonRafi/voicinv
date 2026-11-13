import { bn } from '../bn';
import { en } from '../en';

type Leaf = readonly [path: string, value: string];

/** Flattens a content tree into `path → string` pairs, e.g. `faq.items.0.question`. */
function leaves(value: unknown, path = ''): Leaf[] {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => leaves(item, `${path}.${index}`));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, child]) =>
      leaves(child, path === '' ? key : `${path}.${key}`),
    );
  }
  throw new Error(`Unexpected ${typeof value} in content at "${path}"`);
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const english = leaves(en);
const bengali = leaves(bn);
const bengaliByPath = new Map(bengali);

describe('site content', () => {
  it('has exactly the same strings, lists and list lengths in both languages', () => {
    expect(bengali.map(([path]) => path)).toEqual(english.map(([path]) => path));
  });

  it('has no empty or untrimmed strings', () => {
    for (const [path, value] of [...english, ...bengali]) {
      expect(value.trim(), path).not.toBe('');
      expect(value, path).toBe(value.trim());
    }
  });

  it('uses the same placeholders in both languages', () => {
    for (const [path, value] of english) {
      expect(placeholders(bengaliByPath.get(path) ?? ''), path).toEqual(placeholders(value));
    }
  });

  it('uses the same icons in both languages', () => {
    const icons = (content: typeof en) => [
      ...content.home.highlights.items.map((item) => item.icon),
      ...content.features.groups.map((group) => group.icon),
    ];
    expect(icons(bn)).toEqual(icons(en));
  });

  it('is actually translated: Bengali copy is written in Bengali script', () => {
    // Strings that are legitimately identical in both languages.
    const shared = new Set(['meta.siteName']);
    for (const [path, value] of bengali) {
      if (shared.has(path) || path.endsWith('.icon')) continue;
      expect(value, path).toMatch(/[ঀ-৿]/);
    }
  });

  it('keeps English copy free of Bengali script', () => {
    for (const [path, value] of english) {
      expect(value, path).not.toMatch(/[ঀ-৿]/);
    }
  });

  it('never promises third-party sending or cloud voice processing', () => {
    // Guards the product's hard constraints (AGENTS.md §1) against marketing drift.
    for (const [path, value] of english) {
      expect(value, path).not.toMatch(/automatic(ally)? (send|whatsapp)/i);
      expect(value, path).not.toMatch(/\bAI\b|cloud speech/);
    }
  });
});
