/**
 * Compact text form of a grid: one character per cell, row-major.
 * Values use the display symbols (1–9, A–P); empty cells are ".".
 * A 9×9 puzzle is 81 characters; 25×25 is 625.
 */
import { SUPPORTED_SIZES } from "./sizes";
import { symbolFor } from "./symbols";

const SYMBOLS = "123456789ABCDEFGHIJKLMNOP";

export function encodeGrid(values: readonly number[]): string {
  return values.map((v) => (v === 0 ? "." : symbolFor(v))).join("");
}

/** Decode and validate; returns null for anything malformed. */
export function decodeGrid(text: string, size: number): number[] | null {
  if (!SUPPORTED_SIZES.includes(size as (typeof SUPPORTED_SIZES)[number])) return null;
  if (text.length !== size * size) return null;
  const values: number[] = [];
  for (const ch of text) {
    if (ch === ".") {
      values.push(0);
      continue;
    }
    const v = SYMBOLS.indexOf(ch) + 1;
    if (v < 1 || v > size) return null;
    values.push(v);
  }
  return values;
}
