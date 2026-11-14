import { describe, expect, it } from "vitest";
import { bitOf, combinations, popcount, valuesOf } from "./bits";
import { DIFFICULTIES, difficultiesFor, effectiveDifficulty, grade, levelOf } from "./grader";
import { generateOnce, generatePuzzle } from "./puzzle";
import { createRng } from "./random";
import { countSolutions, hasUniqueSolution } from "./solver";
import { generateSolution, makeDisplayPuzzle } from "./generate";
import { specFor } from "./sizes";
import * as T from "./techniques";

describe("bits", () => {
  it("counts, lists and combines", () => {
    expect(popcount(0b1011)).toBe(3);
    expect(popcount(2 ** 25 - 1)).toBe(25);
    expect(valuesOf(0b10110)).toEqual([2, 3, 5]);
    expect(combinations([1, 2, 3, 4], 2)).toHaveLength(6);
  });
});

describe("solver", () => {
  const spec = specFor(9);
  const solution = generateSolution(spec, createRng(3));

  it("finds the single solution of a full grid minus one cell", () => {
    const p = solution.slice();
    p[10] = 0;
    const r = countSolutions(spec, p);
    expect(r.count).toBe(1);
    expect(r.solution).toEqual(solution);
  });

  it("detects multiple solutions on an empty grid", () => {
    expect(countSolutions(spec, new Array(81).fill(0)).count).toBe(2);
    expect(hasUniqueSolution(spec, new Array(81).fill(0))).toBe(false);
  });

  it("detects clashing givens", () => {
    const p = new Array(81).fill(0);
    p[0] = 5;
    p[1] = 5;
    expect(countSolutions(spec, p).count).toBe(0);
  });
});

describe("techniques", () => {
  // Build a state with hand-written candidates on an otherwise empty 9×9.
  const state = (cands: Record<number, number[]>) => {
    const s = T.createState(specFor(9), new Array(81).fill(0));
    for (const [i, vals] of Object.entries(cands)) s.cand[Number(i)] = vals.reduce((m, v) => m | bitOf(v), 0);
    return s;
  };
  const has = (s: T.LogicState, i: number, v: number) => (s.cand[i] & bitOf(v)) !== 0;

  it("naked pair removes the pair from the rest of the unit", () => {
    const s = state({ 0: [1, 2], 1: [1, 2] });
    expect(T.nakedPair(s)).toBe(true);
    expect(has(s, 2, 1) || has(s, 2, 2)).toBe(false); // same row
    expect(has(s, 0, 1)).toBe(true);
  });

  it("X-Wing removes the value from the cross lines", () => {
    // Value 7 only in columns 1 and 5 of rows 0 and 4.
    const s = T.createState(specFor(9), new Array(81).fill(0));
    const b = bitOf(7);
    for (const r of [0, 4]) for (let c = 0; c < 9; c++) if (c !== 1 && c !== 5) s.cand[r * 9 + c] &= ~b;
    expect(T.xWing(s)).toBe(true);
    expect(has(s, 2 * 9 + 1, 7)).toBe(false); // row 2, col 1
    expect(has(s, 8 * 9 + 5, 7)).toBe(false); // row 8, col 5
    expect(has(s, 0 * 9 + 1, 7)).toBe(true);
  });

  it("XY-Wing removes z from cells seeing both pincers", () => {
    // Pivot r0c0 {1,2}; pincers r0c4 {1,3} (row) and r4c0 {2,3} (column); r4c4 sees both.
    const s = state({ 0: [1, 2], 4: [1, 3], 36: [2, 3] });
    expect(T.xyWing(s)).toBe(true);
    expect(has(s, 40, 3)).toBe(false);
  });
});

describe("grader", () => {
  it("rates a puzzle missing only a few cells as easy", () => {
    const spec = specFor(9);
    const solution = generateSolution(spec, createRng(8));
    const p = solution.slice();
    for (const i of [0, 20, 40, 60, 80]) p[i] = 0;
    const r = grade(spec, p);
    expect(r).toMatchObject({ solved: true, level: 1 });
    expect(r.values).toEqual(solution);
  });

  it("never makes an unsound deduction (checked after every move)", () => {
    for (const size of [6, 9]) {
      const spec = specFor(size);
      for (let seed = 1; seed <= 25; seed++) {
        const solution = generateSolution(spec, createRng(seed));
        const puzzle = makeDisplayPuzzle(solution, createRng(seed + 1000), 0.3);
        if (!hasUniqueSolution(spec, puzzle)) continue; // soundness only makes sense with one answer
        grade(spec, puzzle, {
          onStep: (t, s) => {
            for (let i = 0; i < solution.length; i++) {
              const ok = s.values[i] === 0 ? (s.cand[i] & bitOf(solution[i])) !== 0 : s.values[i] === solution[i];
              if (!ok) throw new Error(`${t.name} broke cell ${i} (size ${size}, seed ${seed})`);
            }
          },
        });
      }
    }
  });
});

describe("generator", () => {
  it.each([6, 8, 9])("makes unique %i×%i puzzles that grade at or below the target", (size) => {
    const spec = specFor(size);
    for (const target of DIFFICULTIES) {
      const g = generateOnce(spec, 42, target);
      expect(hasUniqueSolution(spec, g.puzzle)).toBe(true);
      expect(levelOf(g.difficulty)).toBeLessThanOrEqual(levelOf(target));
      expect(g.puzzle.every((v, i) => v === 0 || v === g.solution[i])).toBe(true);
    }
  });

  it("hits easy and medium on 9×9", () => {
    const spec = specFor(9);
    expect(generatePuzzle(spec, 1, "easy").difficulty).toBe("easy");
    expect(generatePuzzle(spec, 1, "medium").difficulty).toBe("medium");
  });

  it("hits medium and hard on 9×9 via the give-clues-back fallback", () => {
    expect(generatePuzzle(specFor(9), 2, "hard", { budgetMs: 8000 }).difficulty).toBe("hard");
  });

  it("offers only easy and medium on 6×6", () => {
    expect(difficultiesFor(6)).toEqual(["easy", "medium"]);
    expect(effectiveDifficulty(6, "expert")).toBe("medium");
    expect(effectiveDifficulty(9, "expert")).toBe("expert");
    expect(generatePuzzle(specFor(6), 3, "medium").difficulty).toBe("medium");
  });

  it("is reproducible from a seed", () => {
    const spec = specFor(9);
    expect(generateOnce(spec, 7, "medium").puzzle).toEqual(generateOnce(spec, 7, "medium").puzzle);
  });
});
