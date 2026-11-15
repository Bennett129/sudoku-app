import { describe, expect, it } from "vitest";
import { makeGameId, toSavedGame, type CompletedGame } from "@/lib/save/serialize";
import { DEFAULT_SETTINGS, parseSettings } from "@/lib/settings";
import {
  chunk,
  completedKey,
  forSync,
  isNewer,
  mergeCompleted,
  parseCompleted,
  parseSyncRequest,
  parseSyncResponse,
  SYNC_LIMITS,
} from "./protocol";

function sampleGame(updatedAt = 1000) {
  const size = 6;
  const cells = size * size;
  const solution = Array.from({ length: cells }, (_, i) => (i % size) + 1);
  const values = solution.map((v, i) => (i % 3 === 0 ? v : 0));
  const snap = { values: values.slice(), notes: new Array(cells).fill(0), hinted: new Array(cells).fill(false) };
  return toSavedGame(
    {
      spec: { size },
      seed: 42,
      id: makeGameId(size, 42),
      createdAt: 500,
      difficulty: "medium",
      bankId: null,
      solution,
      givens: values.map((v) => v !== 0),
      ...snap,
      past: [snap, snap],
      future: [snap],
      selected: 5,
      notesMode: false,
      hintsUsed: 0,
      elapsed: 93,
      status: "playing",
    },
    updatedAt,
  )!;
}

const solve = (completedAt: number, seed = 7): CompletedGame => ({
  size: 9,
  difficulty: "hard",
  seed,
  elapsed: 300,
  hintsUsed: 0,
  completedAt,
});

describe("settings", () => {
  it("fills missing or invalid fields with defaults", () => {
    expect(parseSettings({ theme: "dusk", undoLimit: -4, difficulty: "impossible" })).toEqual({
      ...DEFAULT_SETTINGS,
      theme: "dusk",
    });
    expect(parseSettings({ undoLimit: null })?.undoLimit).toBeNull();
    expect(parseSettings("nope")).toBeNull();
  });
});

describe("sync requests", () => {
  it("strips undo history from uploaded games", () => {
    const game = sampleGame();
    expect(game.past.length).toBe(2);
    expect(forSync(game).past).toEqual([]);
    const req = parseSyncRequest({ cursor: 0, games: [game] });
    if (typeof req === "string") throw new Error(req);
    expect(req.games[0].past).toEqual([]);
    expect(req.games[0].future).toEqual([]);
    expect(req.games[0].values).toEqual(game.values);
  });

  it("drops invalid entries but keeps valid ones", () => {
    const req = parseSyncRequest({
      cursor: 5,
      games: [sampleGame(), { v: 2, size: 7 }, sampleGame(0)],
      removed: [{ id: "6-x", at: 10 }, { id: "", at: 1 }, { id: "a".repeat(65), at: 1 }],
      completed: [solve(100), { ...solve(100), size: 4 }, { ...solve(100), elapsed: -1 }],
      settings: { data: { theme: "pass" }, updatedAt: 99 },
    });
    if (typeof req === "string") throw new Error(req);
    expect(req.games).toHaveLength(1); // the size-7 game and the one with no updatedAt are dropped
    expect(req.removed).toEqual([{ id: "6-x", at: 10 }]);
    expect(req.completed).toHaveLength(1);
    expect(req.settings?.data.theme).toBe("pass");
    expect(req.pull).toBe(true);
  });

  it("rejects malformed or oversized requests", () => {
    expect(parseSyncRequest(null)).toBeTypeOf("string");
    expect(parseSyncRequest({ cursor: -1 })).toBeTypeOf("string");
    expect(parseSyncRequest({ cursor: 0, games: "x" })).toBeTypeOf("string");
    const tooMany = Array.from({ length: SYNC_LIMITS.removed + 1 }, (_, i) => ({ id: `g${i}`, at: 1 }));
    expect(parseSyncRequest({ cursor: 0, removed: tooMany })).toBeTypeOf("string");
  });

  it("validates responses too", () => {
    expect(parseSyncResponse({ cursor: "soon" })).toBeNull();
    const res = parseSyncResponse({ cursor: 9, games: [sampleGame(), "junk"], removed: [], completed: [solve(1)] });
    expect(res?.games).toHaveLength(1);
    expect(res?.completed).toHaveLength(1);
    expect(res?.settings).toBeNull();
  });
});

describe("stats merging", () => {
  it("merges solves from two devices without duplicates, oldest first", () => {
    const merged = mergeCompleted([solve(3), solve(1)], [solve(1), solve(2, 8)], 100);
    expect(merged.map((c) => c.completedAt)).toEqual([1, 2, 3]);
    expect(new Set(merged.map(completedKey)).size).toBe(3);
  });

  it("keeps only the newest when over the cap", () => {
    const merged = mergeCompleted([solve(1), solve(2)], [solve(3)], 2);
    expect(merged.map((c) => c.completedAt)).toEqual([2, 3]);
  });

  it("normalises a missing difficulty to null", () => {
    const { difficulty, ...rest } = solve(1);
    void difficulty;
    expect(parseCompleted(rest)?.difficulty).toBeNull();
  });
});

describe("chunk", () => {
  it("splits lists and always returns at least one chunk", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 20)).toEqual([[]]);
  });
});

describe("conflicts", () => {
  it("the copy whose board changed last wins, not the one saved last", () => {
    const moved = { ...sampleGame(2000), movedAt: 1900, elapsed: 100 };
    // Open on another device with the clock running: saved later, more time, but no moves.
    const idle = { ...sampleGame(5000), movedAt: 1500, elapsed: 400 };
    expect(isNewer(moved, idle)).toBe(true);
    expect(isNewer(idle, moved)).toBe(false);
  });

  it("with the same last move, more time on the clock wins", () => {
    const a = { ...sampleGame(), movedAt: 1000, elapsed: 50 };
    const b = { ...a, elapsed: 60 };
    expect(isNewer(b, a)).toBe(true);
    expect(isNewer(a, a)).toBe(false);
  });
});

describe("untouched games", () => {
  it("a freshly dealt copy (movedAt 0) loses to a copy with moves", () => {
    const dealtHere = { ...sampleGame(9000), movedAt: 0, elapsed: 30 };
    const playedThere = { ...sampleGame(2000), movedAt: 1500, elapsed: 10 };
    expect(isNewer(playedThere, dealtHere)).toBe(true);
    expect(isNewer(dealtHere, playedThere)).toBe(false);
  });
});
