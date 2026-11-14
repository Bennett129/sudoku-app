import { describe, expect, it } from "vitest";
import { hasProgress, makeGameId, parseSavedGame, summarize, toSavedGame } from "./serialize";

function sampleState(size = 6) {
  const cells = size * size;
  const solution = Array.from({ length: cells }, (_, i) => (i % size) + 1);
  const values = solution.map((v, i) => (i % 3 === 0 ? v : 0));
  const snap = { values: values.slice(), notes: new Array(cells).fill(0), hinted: new Array(cells).fill(false) };
  return {
    spec: { size },
    seed: 42,
    id: makeGameId(size, 42),
    createdAt: 500,
    difficulty: "medium" as const,
    bankId: "k3x9q2ab" as string | null,
    solution,
    givens: values.map((v) => v !== 0),
    ...snap,
    past: [snap],
    future: [],
    selected: 5,
    notesMode: true,
    hintsUsed: 1,
    elapsed: 93,
    status: "playing",
  };
}

describe("saved games", () => {
  it("upgrades v1 saves (no id) to v2", () => {
    const saved = toSavedGame(sampleState(), 1000)!;
    const legacy: Record<string, unknown> = { ...saved, v: 1 };
    delete legacy.id;
    delete legacy.createdAt;
    delete legacy.difficulty;
    const parsed = parseSavedGame(legacy);
    expect(parsed?.v).toBe(2);
    expect(parsed?.id).toBe(makeGameId(6, 42));
    expect(parsed?.createdAt).toBe(1000);
    expect(parsed?.difficulty).toBeNull(); // saved before puzzles were graded
  });

  it("summarises a game for the History list", () => {
    const saved = toSavedGame(sampleState(), 1000)!;
    expect(summarize(saved)).toMatchObject({ id: "6-16", size: 6, status: "playing", filled: 12, total: 36, elapsed: 93 });
  });

  it("round-trips through serialisation", () => {
    const saved = toSavedGame(sampleState(), 1000)!;
    const parsed = parseSavedGame(JSON.parse(JSON.stringify(saved)));
    expect(parsed).toEqual(saved);
  });

  it("does not save a game that is still loading", () => {
    expect(toSavedGame({ ...sampleState(), status: "loading" })).toBeNull();
  });

  it("rejects unknown versions, sizes and malformed grids", () => {
    const saved = toSavedGame(sampleState())!;
    expect(parseSavedGame({ ...saved, v: 99 })).toBeNull();
    expect(parseSavedGame({ ...saved, size: 7 })).toBeNull();
    expect(parseSavedGame({ ...saved, size: 4 })).toBeNull(); // 4×4 no longer offered
    expect(parseSavedGame({ ...saved, values: saved.values.slice(1) })).toBeNull();
    expect(parseSavedGame({ ...saved, values: saved.values.map(() => 9) })).toBeNull();
    expect(parseSavedGame({ ...saved, solution: saved.solution.map(() => 0) })).toBeNull();
    expect(parseSavedGame(null)).toBeNull();
    expect(parseSavedGame("nope")).toBeNull();
  });

  it("drops invalid history entries and out-of-range selection instead of failing", () => {
    const saved = toSavedGame(sampleState())!;
    const parsed = parseSavedGame({ ...saved, past: [saved.past[0], { values: [1] }], selected: 999 });
    expect(parsed?.past).toHaveLength(1);
    expect(parsed?.selected).toBeNull();
  });

  it("accepts 25×25 notes bitmasks", () => {
    const s = sampleState(25);
    s.notes[0] = 2 ** 25 - 1;
    expect(parseSavedGame(toSavedGame(s))?.notes[0]).toBe(2 ** 25 - 1);
  });

  it("detects progress only from player input", () => {
    const s = sampleState();
    expect(hasProgress(s)).toBe(false);
    expect(hasProgress({ ...s, notes: s.notes.map((_, i) => (i === 1 ? 2 : 0)) })).toBe(true);
    expect(hasProgress({ ...s, values: s.values.map((v, i) => (i === 1 ? 2 : v)) })).toBe(true);
    expect(hasProgress({ ...s, values: s.values.map((v, i) => (i === 1 ? 2 : v)), status: "solved" })).toBe(false);
  });
});
