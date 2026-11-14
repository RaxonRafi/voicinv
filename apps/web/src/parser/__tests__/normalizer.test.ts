import { getAllLanguagePacks } from '../lang';
import {
  normalizeBengaliVariants,
  normalizeDigits,
  normalizePunctuation,
  normalizeVoiceInput,
  removeFillers,
} from '../normalizer';

describe('normalizer', () => {
  const packs = getAllLanguagePacks();

  it('converts Bengali digits to ASCII digits', () => {
    expect(normalizeDigits('০১২৩৪৫৬৭৮৯')).toBe('0123456789');
    expect(normalizeDigits('দাম ২৫০ টাকা')).toBe('দাম 250 টাকা');
  });

  it('normalizes Bengali character variants and NFC', () => {
    // Decomposed nukta forms
    const decomposed = '\u09A1\u09BC'; // ড + ়
    expect(normalizeBengaliVariants(decomposed)).toBe('ড়');
  });

  it('removes punctuation and Dari', () => {
    expect(normalizePunctuation('চাল, ডাল এবং তেল।')).toBe('চাল ডাল এবং তেল');
    expect(normalizePunctuation('Karim, 2 bags of rice! Please?')).toBe(
      'Karim 2 bags of rice Please',
    );
  });

  it('removes filler words defined in language packs', () => {
    expect(removeFillers('uh two bags of rice please', packs)).toBe('two bags of rice');
    expect(removeFillers('আরে করিমকে দুই বস্তা চাল দাও একটু', packs)).toBe('করিমকে দুই বস্তা চাল দাও');
  });

  it('runs full normalization pipeline', () => {
    const input = '  আরে করিমকে ২ বস্তা চাল, দাও একটু! ';
    expect(normalizeVoiceInput(input, packs)).toBe('করিমকে 2 বস্তা চাল দাও');
  });
});
