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
import { grade } from "./grader";
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
  maxNodes = 200_000,
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

  const units = unitsFor(spec).all; // rows, then columns, then boxes
  const usedOfUnit = (u: number) => (u < n ? rowUsed[u] : u < 2 * n ? colUsed[u - n] : boxUsed[u - 2 * n]);
  const masks = new Int32Array(grid.length);

  const place = (i: number, b: number) => {
    grid[i] = 32 - Math.clz32(b);
    rowUsed[rowOf[i]] |= b;
    colUsed[colOf[i]] |= b;
    boxUsed[boxOf[i]] |= b;
  };
  const unplace = (i: number, b: number) => {
    grid[i] = 0;
    rowUsed[rowOf[i]] &= ~b;
    colUsed[colOf[i]] &= ~b;
    boxUsed[boxOf[i]] &= ~b;
  };

  /**
   * Branch on whichever is most constrained: the empty cell with the fewest
   * candidates, or the (unit, value) with the fewest possible positions
   * ("hidden single" reasoning). The second makes big sparse grids tractable.
   */
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

    let bestCell = -1;
    let bestCellCount = n + 1;
    for (const i of empty) {
      if (grid[i] !== 0) continue;
      const mask = all & ~(rowUsed[rowOf[i]] | colUsed[colOf[i]] | boxUsed[boxOf[i]]);
      masks[i] = mask;
      const c = popcount(mask);
      if (c === 0) return false;
      if (c < bestCellCount) {
        bestCell = i;
        bestCellCount = c;
      }
    }

    let bestUnit = -1;
    let bestBit = 0;
    let bestPosCount = bestCellCount;
    if (bestCellCount > 1) {
      for (let u = 0; u < units.length; u++) {
        let missing = all & ~usedOfUnit(u);
        while (missing) {
          const b = missing & -missing;
          missing ^= b;
          let c = 0;
          for (const i of units[u]) if (grid[i] === 0 && masks[i] & b) c++;
          if (c === 0) return false;
          if (c < bestPosCount) {
            bestUnit = u;
            bestBit = b;
            bestPosCount = c;
          }
        }
      }
    }

    if (bestUnit >= 0) {
      for (const i of units[bestUnit]) {
        if (grid[i] !== 0 || !(masks[i] & bestBit)) continue;
        place(i, bestBit);
        const stop = search(remaining - 1);
        unplace(i, bestBit);
        if (stop) return true;
      }
      return false;
    }

    let mask = masks[bestCell];
    while (mask) {
      const b = mask & -mask;
      mask ^= b;
      place(bestCell, b);
      const stop = search(remaining - 1);
      unplace(bestCell, b);
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

/**
 * Verify a generated puzzle has exactly one solution.
 *
 * Logical proof: if sound deductions alone (the grader) solve it and reach
 * `solution`, no other solution can exist. Brute force runs as an extra
 * check within a node budget: a second solution means rejection; running
 * out of budget (common on sparse 25×25 grids) leaves the proof standing.
 */
export function verifyUnique(
  spec: GridSpec,
  puzzle: readonly number[],
  solution: readonly number[],
  maxNodes = 50_000,
): boolean {
  const logic = grade(spec, puzzle);
  if (!logic.solved || logic.values.some((v, i) => v !== solution[i])) return false;
  return countSolutions(spec, puzzle, 2, maxNodes).count < 2;
}
