/** Digit sets by Unicode numbering system. Adding a script is a data-only change. */
export const DIGIT_SETS = {
  latn: '0123456789',
  beng: '০১২৩৪৫৬৭৮৯',
  deva: '०१२३४५६७८९',
  arab: '٠١٢٣٤٥٦٧٨٩',
} as const;

export type NumberingSystem = keyof typeof DIGIT_SETS;

const TO_ASCII = new Map<string, string>();
for (const digits of Object.values(DIGIT_SETS)) {
  [...digits].forEach((digit, value) => TO_ASCII.set(digit, String(value)));
}

/** Replaces digits of every supported script with ASCII digits. Other characters are kept. */
export function toAsciiDigits(text: string): string {
  let result = '';
  for (const char of text) result += TO_ASCII.get(char) ?? char;
  return result;
}

/** Replaces ASCII digits with the digits of the given numbering system. */
export function toLocalDigits(text: string, system: NumberingSystem): string {
  if (system === 'latn') return text;
  const digits = [...DIGIT_SETS[system]];
  return text.replace(/[0-9]/g, (digit) => digits[Number(digit)] ?? digit);
}
