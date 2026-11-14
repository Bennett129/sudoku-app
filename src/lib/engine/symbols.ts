/**
 * Values are stored as integers 1..N (0 = empty) and displayed as
 * 1–9 then A–P, so every value up to 25 maps to exactly one key.
 */
const SYMBOLS = "123456789ABCDEFGHIJKLMNOP";

export const MAX_SIZE = SYMBOLS.length;

export function symbolFor(value: number): string {
  return value > 0 ? (SYMBOLS[value - 1] ?? "") : "";
}

/**
 * Map a KeyboardEvent.code to a value for this grid size, or null.
 * Uses `code` (physical key) rather than `key` so Shift+key still
 * resolves to the same value — Shift is reserved for "enter as note".
 */
export function valueForKeyCode(code: string, size: number): number | null {
  let value: number | null = null;
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  if (digit) value = Number(digit[1]);
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) value = 10 + letter[1].charCodeAt(0) - "A".charCodeAt(0);
  return value !== null && value <= size ? value : null;
}
