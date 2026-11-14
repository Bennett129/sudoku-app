/**
 * Stats from finished games (pure, unit-tested).
 *
 * Grouped by grid size and difficulty. Best times only count solves without
 * hints — a hinted solve isn't a fair comparison. Games finished before
 * puzzles were graded have no difficulty and form their own "unrated" group.
 */
import { DIFFICULTIES, SUPPORTED_SIZES, type Difficulty } from "@/lib/engine";
import type { CompletedGame } from "@/lib/save/serialize";

export interface GroupStats {
  size: number;
  difficulty: Difficulty | null;
  solved: number;
  noHintSolved: number;
  /** Fastest solve without hints, in seconds. */
  bestTime: number | null;
  averageTime: number;
  lastSolvedAt: number;
}

export interface Stats {
  solved: number;
  noHintSolved: number;
  totalTime: number;
  /** Only groups with at least one solve, by size then difficulty. */
  groups: GroupStats[];
}

const offered = (size: number) => SUPPORTED_SIZES.includes(size as (typeof SUPPORTED_SIZES)[number]);
const rank = (d: Difficulty | null) => (d === null ? -1 : DIFFICULTIES.indexOf(d));
const sameGroup = (r: CompletedGame, size: number, difficulty: Difficulty | null) =>
  r.size === size && (r.difficulty ?? null) === difficulty;

function summarise(size: number, difficulty: Difficulty | null, games: CompletedGame[]): GroupStats {
  const clean = games.filter((g) => g.hintsUsed === 0);
  return {
    size,
    difficulty,
    solved: games.length,
    noHintSolved: clean.length,
    bestTime: clean.length ? Math.min(...clean.map((g) => g.elapsed)) : null,
    averageTime: games.length ? Math.round(games.reduce((sum, g) => sum + g.elapsed, 0) / games.length) : 0,
    lastSolvedAt: games.length ? Math.max(...games.map((g) => g.completedAt)) : 0,
  };
}

export function computeStats(records: readonly CompletedGame[]): Stats {
  const games = records.filter((r) => offered(r.size));
  const keys = new Map<string, { size: number; difficulty: Difficulty | null }>();
  for (const g of games) keys.set(`${g.size}|${g.difficulty ?? ""}`, { size: g.size, difficulty: g.difficulty ?? null });

  const groups = [...keys.values()]
    .sort((a, b) => a.size - b.size || rank(a.difficulty) - rank(b.difficulty))
    .map(({ size, difficulty }) => summarise(size, difficulty, games.filter((g) => sameGroup(g, size, difficulty))));

  return {
    solved: games.length,
    noHintSolved: games.filter((g) => g.hintsUsed === 0).length,
    totalTime: games.reduce((sum, g) => sum + g.elapsed, 0),
    groups,
  };
}

/** Stats for one size + difficulty (an empty record if never solved). */
export function statsFor(stats: Stats, size: number, difficulty: Difficulty | null): GroupStats {
  return (
    stats.groups.find((s) => s.size === size && s.difficulty === difficulty) ?? summarise(size, difficulty, [])
  );
}

export type SolveBadge = "first" | "best" | null;

/**
 * How a just-finished game compares with earlier solves of the same size and
 * difficulty. The game itself is excluded by seed, recorded yet or not.
 */
export function solveBadge(
  records: readonly CompletedGame[],
  game: { size: number; difficulty: Difficulty | null; seed: number; elapsed: number; hintsUsed: number },
): SolveBadge {
  const earlier = records.filter((r) => sameGroup(r, game.size, game.difficulty) && r.seed !== game.seed);
  if (earlier.length === 0) return "first";
  if (game.hintsUsed > 0) return null;
  const clean = earlier.filter((r) => r.hintsUsed === 0);
  if (clean.length === 0) return "best";
  return game.elapsed < Math.min(...clean.map((r) => r.elapsed)) ? "best" : null;
}
