/**
 * Puzzle generation by technique-bounded removal.
 *
 * Start from a random complete grid and remove cells in random order. A
 * removal is kept only if the grader can still solve the puzzle using
 * techniques no harder than the target difficulty. Because those techniques
 * are all sound deductions, every kept puzzle has exactly one solution.
 *
 * The result can come out easier than the target (removal may never force
 * the hardest technique — most random minimal 9×9s need only singles), so we
 * retry with fresh grids until a time budget runs out and return the closest
 * match, labelled with its *actual* rating. Each attempt is reproducible from
 * its seed; how many attempts fit in the budget depends on the device.
 *
 * Measured per attempt (desktop): 9×9 ≈ 10 ms; 16×16 ≈ 20–260 ms;
 * 25×25 ≈ 0.5 s (easy) to ≈ 5 s (expert).
 */
import { generateSolution } from "./generate";
import { difficultyOf, grade, levelOf, type Difficulty } from "./grader";
import { createRng, range, shuffled, type Rng } from "./random";
import type { GridSpec } from "./sizes";

/** Keep easier puzzles from getting too sparse: max share of cells removed. */
const MAX_REMOVED: Record<Difficulty, number> = {
  easy: 0.55,
  medium: 1,
  hard: 1,
  expert: 1,
};

export interface GeneratedPuzzle {
  puzzle: number[];
  solution: number[];
  /** The rating the grader actually gave (may be below the target). */
  difficulty: Difficulty;
  target: Difficulty;
  /** Technique usage counts from grading. */
  techniques: Record<string, number>;
  attempts: number;
}

export interface GenerateOptions {
  /** Stop retrying after this many ms (the best attempt so far is returned). */
  budgetMs?: number;
  maxAttempts?: number;
  now?: () => number;
}

/** One pass: random grid, technique-bounded removal, then grade. */
/** Remove cells in random order while the puzzle stays solvable with techniques up to `maxLevel`. */
function removeCells(spec: GridSpec, solution: readonly number[], rng: Rng, maxLevel: number, limit: number): number[] {
  const puzzle = solution.slice();
  let removed = 0;
  for (const i of shuffled(range(puzzle.length), rng)) {
    if (removed >= limit) break;
    const v = puzzle[i];
    puzzle[i] = 0;
    if (grade(spec, puzzle, { maxLevel }).solved) removed++;
    else puzzle[i] = v;
  }
  return puzzle;
}

/**
 * Walk a too-hard puzzle down to exactly `target` by giving back clues: keep a
 * clue if the puzzle is still harder than the target, drop it again if it
 * made the puzzle too easy, stop as soon as it rates exactly at the target.
 * Adding clues never breaks uniqueness.
 */
function addCluesUntil(spec: GridSpec, puzzle: readonly number[], solution: readonly number[], rng: Rng, target: number) {
  const p = puzzle.slice();
  const empty = range(p.length).filter((i) => p[i] === 0);
  for (const i of shuffled(empty, rng)) {
    p[i] = solution[i];
    const r = grade(spec, p);
    if (r.level === target) return { puzzle: p, result: r };
    if (r.level < target) p[i] = 0;
  }
  return null;
}

export function generateOnce(spec: GridSpec, seed: number, target: Difficulty): Omit<GeneratedPuzzle, "attempts" | "target"> {
  const rng = createRng(seed);
  const solution = generateSolution(spec, rng);
  const want = levelOf(target);
  const limit = Math.floor(solution.length * MAX_REMOVED[target]);

  // 1. Technique-bounded removal: never harder than the target.
  let puzzle = removeCells(spec, solution, rng, want, limit);
  let result = grade(spec, puzzle, { maxLevel: want });

  // 2. Came out too easy? Remove without a bound, then (if that overshoots)
  //    give clues back until it rates exactly at the target.
  if (result.level < want && want > 1) {
    const deep = removeCells(spec, solution, rng, 4, limit);
    const deepResult = grade(spec, deep);
    if (deepResult.level === want) {
      puzzle = deep;
      result = deepResult;
    } else if (deepResult.level > want) {
      // The deep puzzle is the expensive part; try a few clue orders on it.
      for (let tries = 0; tries < 3; tries++) {
        const walked = addCluesUntil(spec, deep, solution, rng, want);
        if (walked) {
          ({ puzzle, result } = walked);
          break;
        }
      }
    }
  }

  return { puzzle, solution, difficulty: difficultyOf(result.level), techniques: result.counts };
}

/** Time allowed for retries; one attempt always completes even if it runs over. */
export function budgetFor(size: number): number {
  if (size <= 12) return 4000;
  if (size <= 16) return 4000;
  if (size <= 20) return 6000;
  return 9000;
}

export function generatePuzzle(
  spec: GridSpec,
  seed: number,
  target: Difficulty,
  { budgetMs = budgetFor(spec.size), maxAttempts = 5000, now = () => performance.now() }: GenerateOptions = {},
): GeneratedPuzzle {
  const start = now();
  const want = levelOf(target);
  let best: Omit<GeneratedPuzzle, "attempts" | "target"> | null = null;
  let attempts = 0;

  // Derive attempt seeds from the game seed so the whole result is reproducible.
  const seeds = createRng(seed);
  while (attempts < maxAttempts) {
    const attempt = generateOnce(spec, attempts === 0 ? seed : Math.floor(seeds() * 2 ** 32), target);
    attempts++;
    if (!best || levelOf(attempt.difficulty) > levelOf(best.difficulty)) best = attempt;
    if (levelOf(best.difficulty) >= want) break;
    if (now() - start > budgetMs) break;
  }
  return { ...best!, target, attempts };
}
