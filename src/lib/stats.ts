/**
 * Stats from finished games (pure, unit-tested).
 *
 * Best times only count solves without hints — a hinted solve isn't a fair
 * comparison. Stats are per grid size for now; difficulty is added once the
 * real generator and grader exist (phase 3).
 */
import { SUPPORTED_SIZES } from "@/lib/engine";
import type { CompletedGame } from "@/lib/save/serialize";

export interface SizeStats {
  size: number;
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
  /** Only sizes with at least one solve, in size order. */
  bySize: SizeStats[];
}

const offered = (size: number) => SUPPORTED_SIZES.includes(size as (typeof SUPPORTED_SIZES)[number]);

export function computeStats(records: readonly CompletedGame[]): Stats {
  const games = records.filter((r) => offered(r.size));
  const bySize = [...new Set(games.map((g) => g.size))]
    .sort((a, b) => a - b)
    .map((size): SizeStats => {
      const mine = games.filter((g) => g.size === size);
      const clean = mine.filter((g) => g.hintsUsed === 0);
      return {
        size,
        solved: mine.length,
        noHintSolved: clean.length,
        bestTime: clean.length ? Math.min(...clean.map((g) => g.elapsed)) : null,
        averageTime: Math.round(mine.reduce((sum, g) => sum + g.elapsed, 0) / mine.length),
        lastSolvedAt: Math.max(...mine.map((g) => g.completedAt)),
      };
    });

  return {
    solved: games.length,
    noHintSolved: games.filter((g) => g.hintsUsed === 0).length,
    totalTime: games.reduce((sum, g) => sum + g.elapsed, 0),
    bySize,
  };
}

export type SolveBadge = "first" | "best" | null;

/**
 * How a just-finished game compares with earlier solves of the same size.
 * The game itself is excluded by seed, whether or not it has been recorded yet.
 */
export function solveBadge(
  records: readonly CompletedGame[],
  game: { size: number; seed: number; elapsed: number; hintsUsed: number },
): SolveBadge {
  const earlier = records.filter((r) => r.size === game.size && r.seed !== game.seed);
  if (earlier.length === 0) return "first";
  if (game.hintsUsed > 0) return null;
  const clean = earlier.filter((r) => r.hintsUsed === 0);
  if (clean.length === 0) return "best";
  return game.elapsed < Math.min(...clean.map((r) => r.elapsed)) ? "best" : null;
}

/** Stats for one size, or an empty record if it has never been solved. */
export function statsForSize(stats: Stats, size: number): SizeStats {
  return (
    stats.bySize.find((s) => s.size === size) ?? {
      size,
      solved: 0,
      noHintSolved: 0,
      bestTime: null,
      averageTime: 0,
      lastSolvedAt: 0,
    }
  );
}
