/**
 * Grid sizes and box shapes.
 *
 * A size N is supported when it factors as rows × cols with both > 1,
 * so every box is a rectangle of N cells. Prime sizes (5, 7, 11, …) would
 * need irregular "jigsaw" regions and are intentionally out of scope.
 */

export interface BoxShape {
  /** Height of a box in cells. */
  rows: number;
  /** Width of a box in cells. */
  cols: number;
}

export interface GridSpec {
  size: number;
  box: BoxShape;
}

// 4×4 was dropped: it only ever needs naked/hidden singles, so difficulty levels
// can't apply; 6×6 covers "small and easy". The engine still handles any
// rectangular size, so re-adding a size is a one-line change.
export const SUPPORTED_SIZES = [6, 8, 9, 10, 12, 15, 16, 20, 25] as const;
export type SupportedSize = (typeof SUPPORTED_SIZES)[number];

/** Most-square factor pair with rows ≤ cols (6 → 2×3, 12 → 3×4, 25 → 5×5). */
export function boxShapeFor(size: number): BoxShape {
  for (let rows = Math.floor(Math.sqrt(size)); rows > 1; rows--) {
    if (size % rows === 0) return { rows, cols: size / rows };
  }
  throw new Error(`Size ${size} has no rectangular box shape (prime or < 4)`);
}

const specCache = new Map<number, GridSpec>();

export function specFor(size: number): GridSpec {
  let spec = specCache.get(size);
  if (!spec) {
    spec = { size, box: boxShapeFor(size) };
    specCache.set(size, spec);
  }
  return spec;
}
