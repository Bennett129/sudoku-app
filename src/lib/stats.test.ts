import { describe, expect, it } from "vitest";
import type { CompletedGame } from "@/lib/save/serialize";
import { computeStats, solveBadge, statsForSize } from "./stats";

const game = (size: number, seed: number, elapsed: number, hintsUsed = 0, completedAt = seed): CompletedGame => ({
  size,
  seed,
  elapsed,
  hintsUsed,
  completedAt,
});

describe("computeStats", () => {
  const records = [game(9, 1, 300), game(9, 2, 200, 2), game(9, 3, 250), game(6, 4, 60), game(4, 5, 10)];
  const stats = computeStats(records);

  it("ignores sizes the app no longer offers", () => {
    expect(stats.solved).toBe(4);
    expect(stats.bySize.map((s) => s.size)).toEqual([6, 9]);
  });

  it("counts best time from hint-free solves only", () => {
    const nine = statsForSize(stats, 9);
    expect(nine.solved).toBe(3);
    expect(nine.noHintSolved).toBe(2);
    expect(nine.bestTime).toBe(250); // the 200 s solve used hints
    expect(nine.averageTime).toBe(250);
    expect(nine.lastSolvedAt).toBe(3);
  });

  it("totals across sizes", () => {
    expect(stats.noHintSolved).toBe(3);
    expect(stats.totalTime).toBe(810);
  });

  it("returns an empty record for unsolved sizes", () => {
    expect(statsForSize(stats, 16)).toMatchObject({ solved: 0, bestTime: null });
  });

  it("handles no records", () => {
    expect(computeStats([])).toEqual({ solved: 0, noHintSolved: 0, totalTime: 0, bySize: [] });
  });
});

describe("solveBadge", () => {
  const records = [game(9, 1, 300), game(9, 2, 200, 2)];

  it("marks the first solve of a size", () => {
    expect(solveBadge(records, { size: 16, seed: 9, elapsed: 999, hintsUsed: 3 })).toBe("first");
  });

  it("marks a new best only for hint-free solves faster than earlier hint-free ones", () => {
    expect(solveBadge(records, { size: 9, seed: 7, elapsed: 299, hintsUsed: 0 })).toBe("best");
    expect(solveBadge(records, { size: 9, seed: 7, elapsed: 301, hintsUsed: 0 })).toBeNull();
    expect(solveBadge(records, { size: 9, seed: 7, elapsed: 100, hintsUsed: 1 })).toBeNull();
  });

  it("excludes the game itself whether or not it was recorded yet", () => {
    const withSelf = [...records, game(9, 7, 150)];
    expect(solveBadge(withSelf, { size: 9, seed: 7, elapsed: 150, hintsUsed: 0 })).toBe("best");
  });

  it("treats the first hint-free solve as a best", () => {
    expect(solveBadge([game(6, 1, 50, 1)], { size: 6, seed: 2, elapsed: 80, hintsUsed: 0 })).toBe("best");
  });
});
