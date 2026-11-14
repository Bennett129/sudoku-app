/**
 * Fast brute-force solution counter (not human-like).
 *
 * Bitmask "used" sets per row/column/box; always branches on the empty cell
 * with the fewest candidates; stops as soon as `limit` solutions are found.
 * A node budget guards against pathological cases on big grids: if it runs
 * out, the result is `exhausted` and the count is a lower bound.
 */
import { bitOf, popcount } from "./bits";
import type { GridSpec } from "./sizes";
import { unitsFor } from "./units";

export interface CountResult {
  count: number;
  exhausted: boolean;
  /** First solution found, if any. */
  solution: number[] | null;
}

export function countSolutions(
  spec: GridSpec,
  puzzle: readonly number[],
  limit = 2,
  maxNodes = 2_000_000,
): CountResult {
  const n = spec.size;
  const { rowOf, colOf, boxOf } = unitsFor(spec);
  const all = 2 ** n - 1;
  const rowUsed = new Int32Array(n);
  const colUsed = new Int32Array(n);
  const boxUsed = new Int32Array(n);
  const grid = Int32Array.from(puzzle);
  const empty: number[] = [];

  for (let i = 0; i < grid.length; i++) {
    const v = grid[i];
    if (v === 0) {
      empty.push(i);
      continue;
    }
    const b = bitOf(v);
    // A clash among the givens means no solution at all.
    if ((rowUsed[rowOf[i]] | colUsed[colOf[i]] | boxUsed[boxOf[i]]) & b) return { count: 0, exhausted: false, solution: null };
    rowUsed[rowOf[i]] |= b;
    colUsed[colOf[i]] |= b;
    boxUsed[boxOf[i]] |= b;
  }

  let count = 0;
  let nodes = 0;
  let exhausted = false;
  let solution: number[] | null = null;

  const search = (remaining: number): boolean => {
    if (remaining === 0) {
      count++;
      if (!solution) solution = Array.from(grid);
      return count >= limit;
    }
    if (++nodes > maxNodes) {
      exhausted = true;
      return true;
    }
    // Pick the empty cell with the fewest candidates (swap it to the end of the active range).
    let best = -1;
    let bestMask = 0;
    let bestCount = n + 1;
    for (let k = 0; k < remaining; k++) {
      const i = empty[k];
      const mask = all & ~(rowUsed[rowOf[i]] | colUsed[colOf[i]] | boxUsed[boxOf[i]]);
      const c = popcount(mask);
      if (c < bestCount) {
        best = k;
        bestMask = mask;
        bestCount = c;
        if (c <= 1) break;
      }
    }
    if (bestCount === 0) return false;
    const last = remaining - 1;
    [empty[best], empty[last]] = [empty[last], empty[best]];
    const i = empty[last];
    const r = rowOf[i];
    const c = colOf[i];
    const bx = boxOf[i];
    let mask = bestMask;
    while (mask) {
      const b = mask & -mask;
      mask ^= b;
      grid[i] = 32 - Math.clz32(b);
      rowUsed[r] |= b;
      colUsed[c] |= b;
      boxUsed[bx] |= b;
      const stop = search(last);
      rowUsed[r] &= ~b;
      colUsed[c] &= ~b;
      boxUsed[bx] &= ~b;
      grid[i] = 0;
      if (stop) return true;
    }
    return false;
  };

  search(empty.length);
  return { count, exhausted, solution };
}

/** True only when the puzzle provably has exactly one solution. */
export function hasUniqueSolution(spec: GridSpec, puzzle: readonly number[], maxNodes?: number): boolean {
  const r = countSolutions(spec, puzzle, 2, maxNodes);
  return r.count === 1 && !r.exhausted;
}
