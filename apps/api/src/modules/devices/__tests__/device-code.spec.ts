import { deviceCodeFromSequence, MAX_DEVICE_SEQUENCE } from '../device-code.js';

describe('deviceCodeFromSequence', () => {
  it.each([
    [1, 'A'],
    [2, 'B'],
    [26, 'Z'],
    [27, 'AA'],
    [28, 'AB'],
    [52, 'AZ'],
    [53, 'BA'],
    [702, 'ZZ'],
    [703, 'AAA'],
    [MAX_DEVICE_SEQUENCE, 'ZZZ'],
  ])('maps %i to %s', (sequence, code) => {
    expect(deviceCodeFromSequence(sequence)).toBe(code);
  });

  it('gives every sequence its own code that fits the invoice number format', () => {
    const codes = new Set<string>();
    for (let sequence = 1; sequence <= MAX_DEVICE_SEQUENCE; sequence += 1) {
      const code = deviceCodeFromSequence(sequence);
      expect(code).toMatch(/^[A-Z]{1,3}$/);
      codes.add(code ?? '');
    }
    expect(codes.size).toBe(MAX_DEVICE_SEQUENCE);
  });

  it.each([0, -1, 1.5, MAX_DEVICE_SEQUENCE + 1, Number.NaN])('rejects %s', (sequence) => {
    expect(deviceCodeFromSequence(sequence)).toBeNull();
  });
});
