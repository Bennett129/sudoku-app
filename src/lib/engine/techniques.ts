/**
 * Human solving techniques, each working on generic units (rows, columns,
 * boxes) so they apply to every grid size.
 *
 * A technique looks for one pattern, applies it (placing values and/or
 * removing candidates) and returns true if it changed anything. Every move
 * is a valid deduction — none assume the puzzle has a unique solution —
 * so a puzzle these techniques solve is guaranteed to have exactly one.
 *
 * Levels follow Conceptis: 1 Easy, 2 Medium, 3 Hard, 4 Expert.
 */
import { bitOf, combinations, popcount, valueOfBit, valuesOf } from "./bits";
import { candidatesFor } from "./candidates";
import type { GridSpec } from "./sizes";
import { unitsFor, type Units } from "./units";

export interface LogicState {
  n: number;
  units: Units;
  values: Int32Array;
  /** Candidate bitmask per cell; 0 for filled cells. */
  cand: Int32Array;
}

export function createState(spec: GridSpec, puzzle: readonly number[]): LogicState {
  return {
    n: spec.size,
    units: unitsFor(spec),
    values: Int32Array.from(puzzle),
    cand: Int32Array.from(candidatesFor(spec, puzzle)),
  };
}

function place(s: LogicState, i: number, v: number) {
  s.values[i] = v;
  s.cand[i] = 0;
  const b = bitOf(v);
  for (const p of s.units.peers[i]) s.cand[p] &= ~b;
}

function eliminate(s: LogicState, i: number, mask: number): boolean {
  if ((s.cand[i] & mask) === 0) return false;
  s.cand[i] &= ~mask;
  return true;
}

const sees = (u: Units, a: number, b: number) =>
  a !== b && (u.rowOf[a] === u.rowOf[b] || u.colOf[a] === u.colOf[b] || u.boxOf[a] === u.boxOf[b]);

// ── Level 1 ────────────────────────────────────────────────────────────────

/** A cell with only one candidate left. */
export function nakedSingle(s: LogicState): boolean {
  for (let i = 0; i < s.cand.length; i++) {
    if (s.values[i] === 0 && popcount(s.cand[i]) === 1) {
      place(s, i, valueOfBit(s.cand[i]));
      return true;
    }
  }
  return false;
}

/** A value that fits in only one cell of a unit. */
export function hiddenSingle(s: LogicState): boolean {
  for (const unit of s.units.all) {
    let once = 0;
    let twice = 0;
    for (const i of unit) {
      twice |= once & s.cand[i];
      once |= s.cand[i];
    }
    const singles = once & ~twice;
    if (!singles) continue;
    const b = singles & -singles;
    const i = unit.find((c) => s.cand[c] & b)!;
    place(s, i, valueOfBit(b));
    return true;
  }
  return false;
}

// ── Level 2 ────────────────────────────────────────────────────────────────

/** Pointing: a value's spots in a box all lie on one line → remove it from the rest of that line. */
export function pointing(s: LogicState): boolean {
  const u = s.units;
  for (const box of u.boxes) {
    for (let v = 1; v <= s.n; v++) {
      const b = bitOf(v);
      const spots = box.filter((i) => s.cand[i] & b);
      if (spots.length < 2) continue;
      for (const [lineOf, lines] of [
        [u.rowOf, u.rows],
        [u.colOf, u.cols],
      ] as const) {
        const line = lineOf[spots[0]];
        if (!spots.every((i) => lineOf[i] === line)) continue;
        let changed = false;
        for (const i of lines[line]) if (u.boxOf[i] !== u.boxOf[spots[0]]) changed = eliminate(s, i, b) || changed;
        if (changed) return true;
      }
    }
  }
  return false;
}

/** Box/line reduction: a value's spots on a line all lie in one box → remove it from the rest of that box. */
export function boxLineReduction(s: LogicState): boolean {
  const u = s.units;
  for (const [lines, lineOf] of [
    [u.rows, u.rowOf],
    [u.cols, u.colOf],
  ] as const) {
    for (const line of lines) {
      for (let v = 1; v <= s.n; v++) {
        const b = bitOf(v);
        const spots = line.filter((i) => s.cand[i] & b);
        if (spots.length < 2) continue;
        const box = u.boxOf[spots[0]];
        if (!spots.every((i) => u.boxOf[i] === box)) continue;
        let changed = false;
        for (const i of u.boxes[box]) if (lineOf[i] !== lineOf[spots[0]]) changed = eliminate(s, i, b) || changed;
        if (changed) return true;
      }
    }
  }
  return false;
}

/** k cells in a unit whose candidates together are exactly k values → remove those values elsewhere in the unit. */
function nakedSubset(s: LogicState, k: number): boolean {
  for (const unit of s.units.all) {
    const open = unit.filter((i) => s.values[i] === 0);
    if (open.length <= k) continue;
    const small = open.filter((i) => popcount(s.cand[i]) <= k);
    if (small.length < k) continue;
    for (const group of combinations(small, k)) {
      let union = 0;
      for (const i of group) union |= s.cand[i];
      if (popcount(union) !== k) continue;
      let changed = false;
      for (const i of open) if (!group.includes(i)) changed = eliminate(s, i, union) || changed;
      if (changed) return true;
    }
  }
  return false;
}

/** k values confined to the same k cells of a unit → those cells hold nothing else. */
function hiddenSubset(s: LogicState, k: number): boolean {
  for (const unit of s.units.all) {
    const open = unit.filter((i) => s.values[i] === 0);
    if (open.length <= k) continue;
    // Per value: bitmask of positions within `open`.
    const spots = new Map<number, number>();
    for (let v = 1; v <= s.n; v++) {
      const b = bitOf(v);
      let pos = 0;
      open.forEach((i, p) => {
        if (s.cand[i] & b) pos |= 1 << p;
      });
      const c = popcount(pos);
      if (c >= 1 && c <= k) spots.set(v, pos);
    }
    if (spots.size < k) continue;
    for (const vals of combinations([...spots.keys()], k)) {
      let pos = 0;
      let keep = 0;
      for (const v of vals) {
        pos |= spots.get(v)!;
        keep |= bitOf(v);
      }
      if (popcount(pos) !== k) continue;
      let changed = false;
      for (let p = 0; p < open.length; p++) if (pos & (1 << p)) changed = eliminate(s, open[p], ~keep) || changed;
      if (changed) return true;
    }
  }
  return false;
}

export const nakedPair = (s: LogicState) => nakedSubset(s, 2);
export const hiddenPair = (s: LogicState) => hiddenSubset(s, 2);

// ── Level 3 ────────────────────────────────────────────────────────────────

export const nakedTriple = (s: LogicState) => nakedSubset(s, 3);
export const hiddenTriple = (s: LogicState) => hiddenSubset(s, 3);
export const nakedQuad = (s: LogicState) => nakedSubset(s, 4);
export const hiddenQuad = (s: LogicState) => hiddenSubset(s, 4);

/**
 * Fish of size k (X-Wing 2, Swordfish 3, Jellyfish 4): in k base lines a value
 * fits only within the same k cross lines → remove it from those cross lines
 * everywhere else. Tried with rows as base, then columns.
 */
function fish(s: LogicState, k: number): boolean {
  const u = s.units;
  for (const [base, cross] of [
    [u.rows, u.cols],
    [u.cols, u.rows],
  ] as const) {
    for (let v = 1; v <= s.n; v++) {
      const b = bitOf(v);
      // For each base line, the cross-line positions where v can go.
      const lines: { line: number; pos: number }[] = [];
      base.forEach((cells, line) => {
        let pos = 0;
        cells.forEach((i, p) => {
          if (s.cand[i] & b) pos |= 1 << p;
        });
        const c = popcount(pos);
        if (c >= 2 && c <= k) lines.push({ line, pos });
      });
      if (lines.length < k) continue;
      for (const group of combinations(lines, k)) {
        let pos = 0;
        for (const g of group) pos |= g.pos;
        if (popcount(pos) !== k) continue;
        const baseLines = new Set(group.map((g) => g.line));
        let changed = false;
        for (const p of valuesOf(pos)) {
          // valuesOf gives 1-based bit numbers; cross line index is p - 1.
          for (const [line, i] of cross[p - 1].entries()) if (!baseLines.has(line)) changed = eliminate(s, i, b) || changed;
        }
        if (changed) return true;
      }
    }
  }
  return false;
}

export const xWing = (s: LogicState) => fish(s, 2);
export const swordfish = (s: LogicState) => fish(s, 3);

// ── Level 4 ────────────────────────────────────────────────────────────────

export const jellyfish = (s: LogicState) => fish(s, 4);

/**
 * XY-Wing: pivot {x,y} sees pincers {x,z} and {y,z}. Whichever value the
 * pivot takes, one pincer is z → z goes from every cell seeing both pincers.
 */
export function xyWing(s: LogicState): boolean {
  const u = s.units;
  for (let p = 0; p < s.cand.length; p++) {
    const pm = s.cand[p];
    if (popcount(pm) !== 2) continue;
    const pincers = u.peers[p].filter((i) => {
      const m = s.cand[i];
      return popcount(m) === 2 && popcount(m & pm) === 1;
    });
    for (const a of pincers) {
      const z = s.cand[a] & ~pm;
      const need = (pm & ~s.cand[a]) | z; // the other pivot value + z
      for (const b of pincers) {
        if (b === a || s.cand[b] !== need) continue;
        let changed = false;
        for (let i = 0; i < s.cand.length; i++) {
          if (i !== p && sees(u, i, a) && sees(u, i, b)) changed = eliminate(s, i, z) || changed;
        }
        if (changed) return true;
      }
    }
  }
  return false;
}

/**
 * XYZ-Wing: pivot {x,y,z} sees pincers {x,z} and {y,z} → z goes from every
 * cell seeing the pivot and both pincers.
 */
export function xyzWing(s: LogicState): boolean {
  const u = s.units;
  for (let p = 0; p < s.cand.length; p++) {
    const pm = s.cand[p];
    if (popcount(pm) !== 3) continue;
    const pincers = Array.from(u.peers[p]).filter((i) => popcount(s.cand[i]) === 2 && (s.cand[i] & ~pm) === 0);
    for (const [a, b] of combinations(pincers, 2)) {
      const z = s.cand[a] & s.cand[b];
      if (popcount(z) !== 1 || (s.cand[a] | s.cand[b]) !== pm) continue;
      let changed = false;
      for (let i = 0; i < s.cand.length; i++) {
        if (i !== a && i !== b && sees(u, i, p) && sees(u, i, a) && sees(u, i, b)) changed = eliminate(s, i, z) || changed;
      }
      if (changed) return true;
    }
  }
  return false;
}
