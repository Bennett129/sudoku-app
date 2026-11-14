/**
 * Saved-game format (pure, framework-free, unit-tested).
 *
 * Anything read back from storage is untrusted: it may come from an older
 * version of the app or be corrupted, so `parseSavedGame` validates every
 * field and returns null rather than letting a bad save crash the board.
 *
 * v1: one save per grid size (no id).  v2: every game has its own id, so
 * past games stay available in History. v1 saves are upgraded on read.
 */
import { DIFFICULTIES, SUPPORTED_SIZES, type Difficulty } from "@/lib/engine";

export const SAVE_VERSION = 2;

export interface SavedSnapshot {
  values: number[];
  notes: number[];
  hinted: boolean[];
}

export interface SavedGame extends SavedSnapshot {
  v: typeof SAVE_VERSION;
  id: string;
  size: number;
  seed: number;
  solution: number[];
  givens: boolean[];
  past: SavedSnapshot[];
  future: SavedSnapshot[];
  selected: number | null;
  notesMode: boolean;
  hintsUsed: number;
  /** Whole seconds. */
  elapsed: number;
  status: "playing" | "solved";
  /** Graded difficulty; null for games saved before puzzles were graded. */
  difficulty: Difficulty | null;
  /** Puzzle-bank id (shareable), or null for locally generated puzzles. */
  bankId: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Lightweight description of a game for the History list. */
export interface GameSummary {
  id: string;
  size: number;
  status: "playing" | "solved";
  difficulty: Difficulty | null;
  bankId: string | null;
  /** Cells filled (givens + entries). */
  filled: number;
  total: number;
  elapsed: number;
  hintsUsed: number;
  createdAt: number;
  updatedAt: number;
}

/** One finished game, kept for stats. */
export interface CompletedGame {
  size: number;
  /** Missing on records from before puzzles were graded. */
  difficulty?: Difficulty | null;
  seed: number;
  elapsed: number;
  hintsUsed: number;
  completedAt: number;
}

/** Stable id from the puzzle itself: the same size + seed is the same puzzle. */
export const makeGameId = (size: number, seed: number) => `${size}-${seed.toString(36)}`;

type GameLike = Omit<SavedGame, "v" | "size" | "updatedAt" | "status"> & {
  spec: { size: number };
  status: string;
};

export function toSavedGame(state: GameLike, now = Date.now()): SavedGame | null {
  if (state.status !== "playing" && state.status !== "solved") return null;
  const copy = (s: SavedSnapshot): SavedSnapshot => ({
    values: s.values.slice(),
    notes: s.notes.slice(),
    hinted: s.hinted.slice(),
  });
  return {
    v: SAVE_VERSION,
    id: state.id,
    size: state.spec.size,
    seed: state.seed,
    solution: state.solution.slice(),
    givens: state.givens.slice(),
    ...copy(state),
    past: state.past.map(copy),
    future: state.future.map(copy),
    selected: state.selected,
    notesMode: state.notesMode,
    hintsUsed: state.hintsUsed,
    elapsed: state.elapsed,
    status: state.status,
    difficulty: state.difficulty,
    bankId: state.bankId,
    createdAt: state.createdAt,
    updatedAt: now,
  };
}

export function summarize(game: SavedGame): GameSummary {
  return {
    id: game.id,
    size: game.size,
    status: game.status,
    difficulty: game.difficulty,
    bankId: game.bankId,
    filled: game.values.filter((v) => v !== 0).length,
    total: game.size * game.size,
    elapsed: game.elapsed,
    hintsUsed: game.hintsUsed,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
  };
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;
const isInt = (x: unknown, min: number, max = Number.MAX_SAFE_INTEGER): x is number =>
  Number.isInteger(x) && (x as number) >= min && (x as number) <= max;
const intArray = (x: unknown, len: number, min: number, max: number): x is number[] =>
  Array.isArray(x) && x.length === len && x.every((v) => isInt(v, min, max));
const boolArray = (x: unknown, len: number): x is boolean[] =>
  Array.isArray(x) && x.length === len && x.every((v) => typeof v === "boolean");

function parseSnapshot(x: unknown, size: number): SavedSnapshot | null {
  if (!isObject(x)) return null;
  const cells = size * size;
  const noteMax = 2 ** size - 1;
  if (!intArray(x.values, cells, 0, size)) return null;
  if (!intArray(x.notes, cells, 0, noteMax)) return null;
  if (!boolArray(x.hinted, cells)) return null;
  return { values: x.values, notes: x.notes, hinted: x.hinted };
}

/** Validate an unknown value from storage. Invalid undo/redo entries are dropped, not fatal. */
export function parseSavedGame(x: unknown): SavedGame | null {
  if (!isObject(x) || (x.v !== 1 && x.v !== SAVE_VERSION)) return null;
  const size = x.size;
  if (!SUPPORTED_SIZES.includes(size as (typeof SUPPORTED_SIZES)[number])) return null;
  const n = size as number;
  const cells = n * n;

  const current = parseSnapshot(x, n);
  if (!current) return null;
  if (!intArray(x.solution, cells, 1, n)) return null;
  if (!boolArray(x.givens, cells)) return null;
  if (!isInt(x.seed, 0) || !isInt(x.hintsUsed, 0) || !isInt(x.elapsed, 0)) return null;
  if (x.status !== "playing" && x.status !== "solved") return null;

  const history = (h: unknown) =>
    Array.isArray(h) ? h.map((s) => parseSnapshot(s, n)).filter((s): s is SavedSnapshot => s !== null) : [];
  const updatedAt = isInt(x.updatedAt, 0) ? x.updatedAt : 0;

  return {
    v: SAVE_VERSION,
    id: typeof x.id === "string" && x.id.length > 0 && x.id.length <= 64 ? x.id : makeGameId(n, x.seed),
    size: n,
    seed: x.seed,
    solution: x.solution,
    givens: x.givens,
    ...current,
    past: history(x.past),
    future: history(x.future),
    selected: isInt(x.selected, 0, cells - 1) ? x.selected : null,
    notesMode: x.notesMode === true,
    hintsUsed: x.hintsUsed,
    elapsed: x.elapsed,
    status: x.status,
    difficulty: DIFFICULTIES.includes(x.difficulty as Difficulty) ? (x.difficulty as Difficulty) : null,
    bankId: typeof x.bankId === "string" && /^[0-9a-z]{8}$/.test(x.bankId) ? x.bankId : null,
    createdAt: isInt(x.createdAt, 0) ? x.createdAt : updatedAt,
    updatedAt,
  };
}

/** True once the player has done anything worth protecting from "New". */
export function hasProgress(game: { values: number[]; givens: boolean[]; notes: number[]; status: string }): boolean {
  if (game.status !== "playing") return false;
  return game.values.some((v, i) => v !== 0 && !game.givens[i]) || game.notes.some((m) => m !== 0);
}
