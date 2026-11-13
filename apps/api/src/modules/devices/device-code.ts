/** Device codes are one to three capital letters: A…Z, AA…ZZ, AAA…ZZZ. */
export const MAX_DEVICE_SEQUENCE = 26 + 26 ** 2 + 26 ** 3;

/**
 * Turns a shop's device number into its code: 1 → "A", 26 → "Z", 27 → "AA", 703 → "AAA".
 * Returns null when the number is outside the range a three-letter code can express.
 */
export function deviceCodeFromSequence(sequence: number): string | null {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_DEVICE_SEQUENCE) return null;
  let remaining = sequence;
  let code = '';
  while (remaining > 0) {
    remaining -= 1;
    code = String.fromCharCode(65 + (remaining % 26)) + code;
    remaining = Math.floor(remaining / 26);
  }
  return code;
}
