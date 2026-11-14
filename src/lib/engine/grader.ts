/**
 * Human-style grader: repeatedly applies the easiest technique that makes
 * progress, restarting from the easiest after every move. A puzzle's rating
 * is the hardest technique it needed.
 */
import type { GridSpec } from "./sizes";
import * as T from "./techniques";
import type { LogicState } from "./techniques";

export const DIFFICULTIES = ["easy", "medium", "hard", "expert"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const levelOf = (d: Difficulty) => DIFFICULTIES.indexOf(d) + 1;
export const difficultyOf = (level: number): Difficulty => DIFFICULTIES[Math.min(Math.max(level, 1), 4) - 1];

/**
 * Difficulties a size can reliably produce. 6×6 has so few values per unit
 * that Hard techniques almost never arise (0 of 300 sampled puzzles needed
 * one), so it offers Easy and Medium — fitting for the beginner size.
 */
export function difficultiesFor(size: number): readonly Difficulty[] {
  return size <= 6 ? ["easy", "medium"] : DIFFICULTIES;
}

/** The preferred difficulty, or the hardest one this size offers below it. */
export function effectiveDifficulty(size: number, preferred: Difficulty): Difficulty {
  const offered = difficultiesFor(size);
  return offered.includes(preferred) ? preferred : offered[offered.length - 1];
}

export interface Technique {
  id: string;
  name: string;
  level: 1 | 2 | 3 | 4;
  apply: (s: LogicState) => boolean;
}

/** Easiest first; within a level, cheapest first. */
export const TECHNIQUES: Technique[] = [
  { id: "naked-single", name: "Naked single", level: 1, apply: T.nakedSingle },
  { id: "hidden-single", name: "Hidden single", level: 1, apply: T.hiddenSingle },
  { id: "pointing", name: "Pointing pair/triple", level: 2, apply: T.pointing },
  { id: "box-line", name: "Box/line reduction", level: 2, apply: T.boxLineReduction },
  { id: "naked-pair", name: "Naked pair", level: 2, apply: T.nakedPair },
  { id: "hidden-pair", name: "Hidden pair", level: 2, apply: T.hiddenPair },
  { id: "naked-triple", name: "Naked triple", level: 3, apply: T.nakedTriple },
  { id: "hidden-triple", name: "Hidden triple", level: 3, apply: T.hiddenTriple },
  { id: "x-wing", name: "X-Wing", level: 3, apply: T.xWing },
  { id: "naked-quad", name: "Naked quad", level: 3, apply: T.nakedQuad },
  { id: "hidden-quad", name: "Hidden quad", level: 3, apply: T.hiddenQuad },
  { id: "swordfish", name: "Swordfish", level: 3, apply: T.swordfish },
  { id: "xy-wing", name: "XY-Wing", level: 4, apply: T.xyWing },
  { id: "xyz-wing", name: "XYZ-Wing", level: 4, apply: T.xyzWing },
  { id: "jellyfish", name: "Jellyfish", level: 4, apply: T.jellyfish },
];

export interface GradeResult {
  /** Fully solved using techniques up to `maxLevel`. */
  solved: boolean;
  /** Hardest level used (1 if nothing beyond the givens was needed). */
  level: number;
  /** Times each technique was applied. */
  counts: Record<string, number>;
  values: number[];
}

export interface GradeOptions {
  maxLevel?: number;
  /** Called after every move (used by tests to check each deduction is sound). */
  onStep?: (technique: Technique, state: LogicState) => void;
}

export function grade(spec: GridSpec, puzzle: readonly number[], options: GradeOptions = {}): GradeResult {
  const maxLevel = options.maxLevel ?? 4;
  const techniques = TECHNIQUES.filter((t) => t.level <= maxLevel);
  const s = T.createState(spec, puzzle);
  const counts: Record<string, number> = {};
  let level = 1;

  for (;;) {
    let open = 0;
    for (let i = 0; i < s.values.length; i++) {
      if (s.values[i] !== 0) continue;
      if (s.cand[i] === 0) return { solved: false, level, counts, values: Array.from(s.values) }; // contradiction
      open++;
    }
    if (open === 0) return { solved: true, level, counts, values: Array.from(s.values) };

    const used = techniques.find((t) => t.apply(s));
    if (!used) return { solved: false, level, counts, values: Array.from(s.values) };
    counts[used.id] = (counts[used.id] ?? 0) + 1;
    level = Math.max(level, used.level);
    options.onStep?.(used, s);
  }
}
