import { appBn } from '../app-bn';
import { appEn } from '../app-en';

type Leaf = readonly [path: string, value: string];

function leaves(value: unknown, path = ''): Leaf[] {
  if (typeof value === 'string') return [[path, value]];
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, child]) =>
      leaves(child, path === '' ? key : `${path}.${key}`),
    );
  }
  throw new Error(`Unexpected ${typeof value} in app content at "${path}"`);
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const english = leaves(appEn);
const bengali = leaves(appBn);
const bengaliByPath = new Map(bengali);

describe('web app content', () => {
  it('has exactly the same strings in both languages', () => {
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

  it('is actually translated: Bengali copy is written in Bengali script', () => {
    for (const [path, value] of bengali) expect(value, path).toMatch(/[ঀ-৿]/);
  });

  it('keeps English copy free of Bengali script', () => {
    for (const [path, value] of english) expect(value, path).not.toMatch(/[ঀ-৿]/);
  });

  it('never promises automatic sending or cloud voice processing', () => {
    for (const [path, value] of english) {
      expect(value, path).not.toMatch(/automatic(ally)? (send|whatsapp)/i);
      expect(value, path).not.toMatch(/\bAI\b|cloud speech/);
    }
  });
});
