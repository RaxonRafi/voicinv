import { matchCustomerInTokens, matchProductAt, resolveUnit } from '../entity-matcher';
import { getAllLanguagePacks } from '../lang';
import { compareEntities, stripSuffix } from '../string-similarity';

describe('entity matcher & similarity', () => {
  const packs = getAllLanguagePacks();

  it('strips suffixes properly', () => {
    expect(stripSuffix("Karim's", packs)).toBe('Karim');
    expect(stripSuffix('করিমকে', packs)).toBe('করিম');
    expect(stripSuffix('রহিমের', packs)).toBe('রহিম');
    expect(stripSuffix('রহিমরে', packs)).toBe('রহিম');
  });

  it('compares entities across transliteration and fuzzy distance', () => {
    expect(compareEntities('karim', 'করিম', packs)).toBeGreaterThan(0.9);
    expect(compareEntities('চাল', 'rice', packs)).toBeGreaterThan(0.9);
    expect(compareEntities('kareem', 'Karim', packs)).toBeGreaterThan(0.85);
  });

  it('matches customer with suffix in tokens', () => {
    const customers = [
      { id: 'c1', name: 'Karim', aliases: [] },
      { id: 'c2', name: 'Rahim' },
    ];
    const res = matchCustomerInTokens(['to', "karim's", 'shop'], customers, [], packs);
    expect(res.match?.item.name).toBe('Karim');
    expect(res.match?.score).toBeGreaterThan(0.9);
  });

  it('prioritizes learned corrections over fuzzy matches', () => {
    const customers = [
      { id: 'c1', name: 'Karim' },
      { id: 'c2', name: 'Kalam' },
    ];
    const corrections = [
      { heardText: 'kareem', correctedText: 'Karim', fieldType: 'customer' as const },
    ];
    const res = matchCustomerInTokens(['kareem'], customers, corrections, packs);
    expect(res.match?.item.name).toBe('Karim');
    expect(res.match?.score).toBe(1.0);
  });

  it('resolves units correctly', () => {
    expect(resolveUnit('bags', packs)).toBe('bag');
    expect(resolveUnit('বস্তা', packs)).toBe('bag');
    expect(resolveUnit('কেজি', packs)).toBe('kg');
    expect(resolveUnit('litres', packs)).toBe('liter');
  });

  it('matches product with transliteration and aliases', () => {
    const products = [
      { id: 'p1', name: 'Rice', unit: 'bag', defaultPrice: 250000, aliases: ['Miniket'] },
    ];
    const res1 = matchProductAt(['rice'], 0, products, [], packs);
    expect(res1.match?.item.name).toBe('Rice');

    const res2 = matchProductAt(['চাল'], 0, products, [], packs);
    expect(res2.match?.item.name).toBe('Rice');

    const res3 = matchProductAt(['miniket'], 0, products, [], packs);
    expect(res3.match?.item.name).toBe('Rice');
  });
});
