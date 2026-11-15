/**
 * The sync protocol between a device and the account (pure, unit-tested,
 * shared by the client and POST /api/sync).
 *
 * One request both pushes and pulls:
 *   - push: games changed since the last sync, deletions (tombstones),
 *     newly finished games (stats) and the settings if they changed;
 *   - pull: everything the account received since `cursor`, from any device.
 *
 * Conflicts resolve last-write-wins per game, using the time its board last
 * changed (movedAt) on the device that changed it, so a device that merely
 * has the game open with the clock running doesn't overwrite moves made
 * elsewhere. Deleting a game is a write too, so a delete only wins over
 * moves made before it. Device clocks are trusted; they're close enough
 * for one person moving between their own devices.
 *
 * Undo/redo history stays on the device: synced games carry the board but
 * not past/future, which keeps requests small.
 */
import { DIFFICULTIES, SUPPORTED_SIZES, type Difficulty } from "@/lib/engine";
import { parseSettings, type Settings } from "@/lib/settings";
import { parseSavedGame, type CompletedGame, type SavedGame } from "@/lib/save/serialize";

/** Per-request limits; the client splits bigger uploads into several requests. */
export const SYNC_LIMITS = {
  games: 20,
  removed: 200,
  completed: 500,
  /** Bytes. */
  body: 2_000_000,
} as const;

/** Account-side caps (oldest are dropped). */
export const ACCOUNT_LIMITS = { games: 100, tombstones: 500, completed: 2000 } as const;

export interface Tombstone {
  id: string;
  /** When it was deleted (ms). */
  at: number;
}

export interface SyncRequest {
  /** From the previous response; 0 on the first sync. */
  cursor: number;
  /** Return changes since `cursor` (only needed on the last request of a batch). */
  pull: boolean;
  settings: { data: Settings; updatedAt: number } | null;
  games: SavedGame[];
  removed: Tombstone[];
  completed: CompletedGame[];
}

export interface SyncResponse {
  /** Pass back as `cursor` next time. */
  cursor: number;
  settings: { data: Settings; updatedAt: number } | null;
  games: SavedGame[];
  removed: Tombstone[];
  completed: CompletedGame[];
}

/**
 * Does copy `a` of a game win over copy `b`? The one whose board changed
 * last; if neither moved since, the one with more time on the clock.
 */
export const isNewer = (a: SavedGame, b: SavedGame) =>
  a.movedAt > b.movedAt || (a.movedAt === b.movedAt && a.elapsed > b.elapsed);

/** A game as it's sent to the account: no undo/redo history. */
export const forSync = (game: SavedGame): SavedGame => ({ ...game, past: [], future: [] });

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isInt = (x: unknown, min: number, max: number): x is number =>
  Number.isInteger(x) && (x as number) >= min && (x as number) <= max;
const MAX_TIME = 8.64e15; // largest valid JS date
const MAX_SEED = 2 ** 32;
const isId = (x: unknown): x is string => typeof x === "string" && x.length > 0 && x.length <= 64;

export function parseTombstone(x: unknown): Tombstone | null {
  if (!isObject(x) || !isId(x.id) || !isInt(x.at, 0, MAX_TIME)) return null;
  return { id: x.id, at: x.at };
}

export function parseCompleted(x: unknown): CompletedGame | null {
  if (!isObject(x)) return null;
  if (!SUPPORTED_SIZES.includes(x.size as (typeof SUPPORTED_SIZES)[number])) return null;
  const size = x.size as number;
  if (!isInt(x.seed, 0, MAX_SEED) || !isInt(x.elapsed, 0, 1e8) || !isInt(x.hintsUsed, 0, size * size)) return null;
  if (!isInt(x.completedAt, 0, MAX_TIME)) return null;
  const difficulty = DIFFICULTIES.includes(x.difficulty as Difficulty) ? (x.difficulty as Difficulty) : null;
  return { size, difficulty, seed: x.seed, elapsed: x.elapsed, hintsUsed: x.hintsUsed, completedAt: x.completedAt };
}

function parseSettingsEnvelope(x: unknown): SyncRequest["settings"] {
  if (!isObject(x) || !isInt(x.updatedAt, 0, MAX_TIME)) return null;
  const data = parseSettings(x.data);
  return data ? { data, updatedAt: x.updatedAt } : null;
}

const listOf = <T>(x: unknown, parse: (v: unknown) => T | null): T[] =>
  Array.isArray(x) ? x.map(parse).filter((v): v is T => v !== null) : [];

/**
 * Validate a request body. Returns an error message for requests that are
 * malformed or over the limits; individual invalid entries are dropped.
 */
export function parseSyncRequest(x: unknown): SyncRequest | string {
  if (!isObject(x)) return "Body must be a JSON object";
  if (!isInt(x.cursor, 0, MAX_TIME)) return "Invalid cursor";
  const raw = { games: x.games ?? [], removed: x.removed ?? [], completed: x.completed ?? [] };
  for (const key of ["games", "removed", "completed"] as const) {
    if (!Array.isArray(raw[key])) return `${key} must be an array`;
    if ((raw[key] as unknown[]).length > SYNC_LIMITS[key]) return `Too many ${key} in one request`;
  }
  return {
    cursor: x.cursor,
    pull: x.pull !== false,
    settings: x.settings == null ? null : parseSettingsEnvelope(x.settings),
    games: listOf(raw.games, (g) => {
      const parsed = parseSavedGame(g);
      // v2 saves always carry a real updatedAt; 0 would never win a conflict anyway.
      return parsed && parsed.updatedAt > 0 ? forSync(parsed) : null;
    }),
    removed: listOf(raw.removed, parseTombstone),
    completed: listOf(raw.completed, parseCompleted),
  };
}

/** Validate a response from the server (it's still data from the network). */
export function parseSyncResponse(x: unknown): SyncResponse | null {
  if (!isObject(x) || !isInt(x.cursor, 0, MAX_TIME)) return null;
  return {
    cursor: x.cursor,
    settings: x.settings == null ? null : parseSettingsEnvelope(x.settings),
    games: listOf(x.games, parseSavedGame),
    removed: listOf(x.removed, parseTombstone),
    completed: listOf(x.completed, parseCompleted),
  };
}

/** Identity of a finished game, for de-duplicating stats from several devices. */
export const completedKey = (c: CompletedGame) => `${c.size}:${c.seed}:${c.completedAt}`;

/** Union of two stats lists without duplicates, oldest first, capped. */
export function mergeCompleted(a: CompletedGame[], b: CompletedGame[], cap: number): CompletedGame[] {
  const byKey = new Map<string, CompletedGame>();
  for (const c of [...a, ...b]) byKey.set(completedKey(c), byKey.get(completedKey(c)) ?? c);
  return [...byKey.values()].sort((x, y) => x.completedAt - y.completedAt).slice(-cap);
}

/** Split a list into chunks of at most `size`. Always returns at least one (possibly empty) chunk. */
export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out.length > 0 ? out : [[]];
}
