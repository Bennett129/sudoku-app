import { describe, expect, it } from "vitest";
import type { Difficulty } from "@/lib/engine";
import type { CompletedGame } from "@/lib/save/serialize";
import { computeStats, solveBadge, statsFor } from "./stats";

const game = (
  size: number,
  seed: number,
  elapsed: number,
  hintsUsed = 0,
  difficulty: Difficulty | null = "easy",
): CompletedGame => ({ size, seed, elapsed, hintsUsed, difficulty, completedAt: seed });

describe("computeStats", () => {
  const records = [
    game(9, 1, 300),
    game(9, 2, 200, 2),
    game(9, 3, 250),
    game(9, 4, 900, 0, "hard"),
    game(6, 5, 60, 0, null), // finished before grading existed
    game(4, 6, 10), // size no longer offered
  ];
  const stats = computeStats(records);

  it("groups by size and difficulty, ignoring sizes no longer offered", () => {
    expect(stats.solved).toBe(5);
    expect(stats.groups.map((g) => `${g.size}:${g.difficulty}`)).toEqual(["6:null", "9:easy", "9:hard"]);
  });

  it("counts best time from hint-free solves only", () => {
    const easy = statsFor(stats, 9, "easy");
    expect(easy.solved).toBe(3);
    expect(easy.noHintSolved).toBe(2);
    expect(easy.bestTime).toBe(250); // the 200 s solve used hints
    expect(easy.averageTime).toBe(250);
    expect(statsFor(stats, 9, "hard").bestTime).toBe(900);
  });

  it("totals across groups", () => {
    expect(stats.noHintSolved).toBe(4);
    expect(stats.totalTime).toBe(1710);
  });

  it("returns an empty record for unsolved groups", () => {
    expect(statsFor(stats, 16, "expert")).toMatchObject({ solved: 0, bestTime: null, averageTime: 0 });
  });

  it("handles no records", () => {
    expect(computeStats([])).toEqual({ solved: 0, noHintSolved: 0, totalTime: 0, groups: [] });
  });
});

describe("solveBadge", () => {
  const records = [game(9, 1, 300), game(9, 2, 200, 2)];
  const finished = (o: Partial<Parameters<typeof solveBadge>[1]>) => ({
    size: 9,
    difficulty: "easy" as Difficulty | null,
    seed: 7,
    elapsed: 100,
    hintsUsed: 0,
    ...o,
  });

  it("marks the first solve of a size and difficulty", () => {
    expect(solveBadge(records, finished({ size: 16 }))).toBe("first");
    expect(solveBadge(records, finished({ difficulty: "hard" }))).toBe("first");
  });

  it("marks a new best only for hint-free solves faster than earlier hint-free ones", () => {
    expect(solveBadge(records, finished({ elapsed: 299 }))).toBe("best");
    expect(solveBadge(records, finished({ elapsed: 301 }))).toBeNull();
    expect(solveBadge(records, finished({ elapsed: 100, hintsUsed: 1 }))).toBeNull();
  });

  it("excludes the game itself whether or not it was recorded yet", () => {
    expect(solveBadge([...records, game(9, 7, 150)], finished({ elapsed: 150 }))).toBe("best");
  });

  it("treats the first hint-free solve as a best", () => {
    expect(solveBadge([game(6, 1, 50, 1)], finished({ size: 6, seed: 2, elapsed: 80 }))).toBe("best");
  });
});
