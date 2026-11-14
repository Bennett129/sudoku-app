import { peersOf } from "./geometry";
import type { GridSpec } from "./sizes";

/**
 * Pencil-mark candidates for every empty cell, as bitmasks (bit v-1 ⇒ v).
 * A value is a candidate when no peer (row, column or box) already holds it.
 * Filled cells get 0. Based on what's on the board, mistakes included —
 * the same as a player filling notes by hand.
 */
export function candidatesFor(spec: GridSpec, values: readonly number[]): number[] {
  const all = 2 ** spec.size - 1;
  const peers = peersOf(spec);
  return values.map((v, i) => {
    if (v !== 0) return 0;
    let used = 0;
    for (const p of peers[i]) if (values[p] !== 0) used |= 1 << (values[p] - 1);
    return all & ~used;
  });
}
