import type { GridSpec } from "./sizes";
import { range, shuffled, type Rng } from "./random";

/**
 * Build a random complete grid of any rectangular-box size.
 *
 * Starts from a pattern that is valid by construction, then applies
 * transformations that preserve validity: relabel symbols, shuffle rows
 * within a band, shuffle bands, shuffle columns within a stack, shuffle
 * stacks, and (square boxes only) transpose. This is instant even at
 * 25×25, so the expensive part of generation will be cell removal.
 */
export function generateSolution(spec: GridSpec, rng: Rng): number[] {
  const { size: n, box } = spec;

  // Pattern: value(r, c) = (C·(r mod R) + ⌊r / R⌋ + c) mod N
  const base = (r: number, c: number) =>
    (box.cols * (r % box.rows) + Math.floor(r / box.rows) + c) % n;

  // Row order: shuffle bands (groups of box.rows rows), then rows within each band.
  const rowOrder = shuffled(range(n / box.rows), rng).flatMap((band) =>
    shuffled(range(box.rows), rng).map((r) => band * box.rows + r),
  );
  // Column order: shuffle stacks (groups of box.cols columns), then columns within each stack.
  const colOrder = shuffled(range(n / box.cols), rng).flatMap((stack) =>
    shuffled(range(box.cols), rng).map((c) => stack * box.cols + c),
  );
  const symbols = shuffled(range(n), rng);
  const transpose = box.rows === box.cols && rng() < 0.5;

  const grid = new Array<number>(n * n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const [pr, pc] = transpose ? [colOrder[c], rowOrder[r]] : [rowOrder[r], colOrder[c]];
      grid[r * n + c] = symbols[base(pr, pc)] + 1;
    }
  }
  return grid;
}

/**
 * Random removal with no uniqueness check — may have several solutions.
 * Not used by the app (see puzzle.ts for real generation); kept for tests
 * that need arbitrary partial grids, e.g. the grader soundness check.
 */
export function makeDisplayPuzzle(
  solution: readonly number[],
  rng: Rng,
  keepRatio = 0.45,
): number[] {
  return solution.map((v) => (rng() < keepRatio ? v : 0));
}

/** True when every row, column and box contains each value exactly once. */
export function isValidSolution(spec: GridSpec, grid: readonly number[]): boolean {
  const { size: n, box } = spec;
  const full = (cells: number[]) => new Set(cells).size === n && cells.every((v) => v >= 1 && v <= n);
  for (let i = 0; i < n; i++) {
    const row = range(n).map((c) => grid[i * n + c]);
    const col = range(n).map((r) => grid[r * n + i]);
    const br = Math.floor(i / (n / box.cols)) * box.rows;
    const bc = (i % (n / box.cols)) * box.cols;
    const cells: number[] = [];
    for (let r = 0; r < box.rows; r++) for (let c = 0; c < box.cols; c++) cells.push(grid[(br + r) * n + bc + c]);
    if (!full(row) || !full(col) || !full(cells)) return false;
  }
  return true;
}
