/** Joins class names, skipping empty and falsy entries. */
export function cx(...classes: readonly (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
