import { getAllLanguagePacks } from '../lang';
import { parseNumberAt, parseNumericLiteral } from '../numbers';

describe('numbers parser', () => {
  const packs = getAllLanguagePacks();

  it('parses literal digits', () => {
    expect(parseNumericLiteral('25')).toBe(25);
    expect(parseNumericLiteral('3.5')).toBe(3.5);
    expect(parseNumericLiteral('abc')).toBeNull();
  });

  it('parses English word numbers and multipliers', () => {
    const res1 = parseNumberAt(['two'], 0, packs);
    expect(res1?.value).toBe(2);

    const res2 = parseNumberAt(['twenty', 'five'], 0, packs);
    expect(res2?.value).toBe(25);

    const res3 = parseNumberAt(['five', 'thousand'], 0, packs);
    expect(res3?.value).toBe(5000);

    const res4 = parseNumberAt(['two', 'lakh'], 0, packs);
    expect(res4?.value).toBe(200000);
  });

  it('parses Bengali word numbers and multipliers', () => {
    const res1 = parseNumberAt(['দুই'], 0, packs);
    expect(res1?.value).toBe(2);

    const res2 = parseNumberAt(['পঁচিশ'], 0, packs);
    expect(res2?.value).toBe(25);

    const res3 = parseNumberAt(['পাঁচ', 'হাজার'], 0, packs);
    expect(res3?.value).toBe(5000);

    const res4 = parseNumberAt(['দুই', 'লাখ'], 0, packs);
    expect(res4?.value).toBe(200000);
  });

  it('parses fractions (Bengali & English)', () => {
    const res1 = parseNumberAt(['half'], 0, packs);
    expect(res1?.value).toBe(0.5);

    const res2 = parseNumberAt(['one', 'and', 'a', 'half'], 0, packs);
    expect(res2?.value).toBe(1.5);

    const res3 = parseNumberAt(['আধা'], 0, packs);
    expect(res3?.value).toBe(0.5);

    const res4 = parseNumberAt(['দেড়'], 0, packs);
    expect(res4?.value).toBe(1.5);

    const res5 = parseNumberAt(['আড়াই'], 0, packs);
    expect(res5?.value).toBe(2.5);

    const res6 = parseNumberAt(['সোয়া', 'দুই'], 0, packs);
    expect(res6?.value).toBe(2.25);

    const res7 = parseNumberAt(['পৌনে', 'দুই'], 0, packs);
    expect(res7?.value).toBe(1.75);

    const res8 = parseNumberAt(['পোয়া'], 0, packs);
    expect(res8?.value).toBe(0.25);
  });

  it('parses mixed digits and words', () => {
    const res1 = parseNumberAt(['2', 'লাখ'], 0, packs);
    expect(res1?.value).toBe(200000);

    const res2 = parseNumberAt(['5', 'thousand'], 0, packs);
    expect(res2?.value).toBe(5000);
  });
});

