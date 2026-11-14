import { boxOf, colOf, peersOf, rowOf } from "./geometry";
import type { GridSpec } from "./sizes";

/** Rows, columns and boxes as cell-index lists, plus per-cell lookups. Cached per size. */
export interface Units {
  rows: number[][];
  cols: number[][];
  boxes: number[][];
  /** rows, then cols, then boxes. */
  all: number[][];
  rowOf: Int32Array;
  colOf: Int32Array;
  boxOf: Int32Array;
  peers: Int32Array[];
}

const cache = new Map<number, Units>();

export function unitsFor(spec: GridSpec): Units {
  const hit = cache.get(spec.size);
  if (hit) return hit;
  const n = spec.size;
  const cells = n * n;
  const rows: number[][] = Array.from({ length: n }, () => []);
  const cols: number[][] = Array.from({ length: n }, () => []);
  const boxes: number[][] = Array.from({ length: n }, () => []);
  const r = new Int32Array(cells);
  const c = new Int32Array(cells);
  const b = new Int32Array(cells);
  for (let i = 0; i < cells; i++) {
    r[i] = rowOf(spec, i);
    c[i] = colOf(spec, i);
    b[i] = boxOf(spec, i);
    rows[r[i]].push(i);
    cols[c[i]].push(i);
    boxes[b[i]].push(i);
  }
  const units: Units = {
    rows,
    cols,
    boxes,
    all: [...rows, ...cols, ...boxes],
    rowOf: r,
    colOf: c,
    boxOf: b,
    peers: peersOf(spec),
  };
  cache.set(n, units);
  return units;
}
