import type { GridSpec } from "./sizes";

/** Cells are indexed row-major: index = row * size + col. */
export const rowOf = (spec: GridSpec, i: number) => Math.floor(i / spec.size);
export const colOf = (spec: GridSpec, i: number) => i % spec.size;

export function boxOf(spec: GridSpec, i: number): number {
  const { size, box } = spec;
  const boxesAcross = size / box.cols;
  const r = rowOf(spec, i);
  const c = colOf(spec, i);
  return Math.floor(r / box.rows) * boxesAcross + Math.floor(c / box.cols);
}

const peerCache = new Map<number, Int32Array[]>();

/** For every cell, the other cells sharing its row, column or box. */
export function peersOf(spec: GridSpec): Int32Array[] {
  const cached = peerCache.get(spec.size);
  if (cached) return cached;

  const n = spec.size * spec.size;
  const rows = new Int32Array(n);
  const cols = new Int32Array(n);
  const boxes = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    rows[i] = rowOf(spec, i);
    cols[i] = colOf(spec, i);
    boxes[i] = boxOf(spec, i);
  }

  const peers: Int32Array[] = [];
  for (let i = 0; i < n; i++) {
    const list: number[] = [];
    for (let j = 0; j < n; j++) {
      if (j !== i && (rows[j] === rows[i] || cols[j] === cols[i] || boxes[j] === boxes[i])) {
        list.push(j);
      }
    }
    peers.push(Int32Array.from(list));
  }
  peerCache.set(spec.size, peers);
  return peers;
}
