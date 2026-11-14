/**
 * Candidate sets are bitmasks: bit (v - 1) set ⇒ value v is possible.
 * Up to 25 values, so everything fits in a 32-bit integer.
 */

export const bitOf = (v: number) => 1 << (v - 1);

export function popcount(x: number): number {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Value of a single-bit mask (lowest set bit if several). */
export const valueOfBit = (mask: number) => 32 - Math.clz32(mask & -mask);

/** All values in a mask, ascending. */
export function valuesOf(mask: number): number[] {
  const out: number[] = [];
  while (mask) {
    const low = mask & -mask;
    out.push(32 - Math.clz32(low));
    mask ^= low;
  }
  return out;
}

/** Every k-element combination of `items` (small k only). */
export function combinations<T>(items: readonly T[], k: number): T[][] {
  const out: T[][] = [];
  const pick: T[] = [];
  const walk = (start: number) => {
    if (pick.length === k) {
      out.push(pick.slice());
      return;
    }
    for (let i = start; i <= items.length - (k - pick.length); i++) {
      pick.push(items[i]);
      walk(i + 1);
      pick.pop();
    }
  };
  walk(0);
  return out;
}
