/**
 * Local game storage in IndexedDB (via idb-keyval).
 *
 * Layout (one key-value store):
 *   game:<id>            full SavedGame
 *   meta:index           GameSummary[] for the History list (newest first)
 *   meta:current:<size>  id of the game shown for that grid size
 *   meta:lastSize        size to reopen on the next visit
 *   completed            CompletedGame[] for stats
 *
 * At most MAX_GAMES games are kept; the oldest are pruned, but never a game
 * that is current for some size. Every call swallows storage errors (private
 * browsing, blocked site data, quota) so the game always stays playable.
 */
import { createStore, del, get, keys, set, update, type UseStore } from "idb-keyval";
import { SUPPORTED_SIZES } from "@/lib/engine";
import { parseSavedGame, summarize, type CompletedGame, type GameSummary, type SavedGame } from "./serialize";

export const MAX_GAMES = 50;
const MAX_COMPLETED = 1000;

let store: UseStore | null = null;
const db = () => (store ??= createStore("sudoku", "kv"));

const gameKey = (id: string) => `game:${id}`;
const currentKey = (size: number) => `meta:current:${size}`;
const INDEX = "meta:index";
const LAST_SIZE = "meta:lastSize";
const COMPLETED = "completed";

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.warn("[save] storage unavailable:", error);
    return fallback;
  }
}

const readIndex = async (): Promise<GameSummary[]> => {
  const list = await get(INDEX, db());
  return Array.isArray(list) ? (list as GameSummary[]) : [];
};

const readCurrentIds = async () =>
  new Set(
    (await Promise.all(SUPPORTED_SIZES.map((n) => get(currentKey(n), db())))).filter(
      (id): id is string => typeof id === "string",
    ),
  );

async function prune() {
  const index = await readIndex();
  if (index.length <= MAX_GAMES) return;
  const current = await readCurrentIds();
  const sorted = [...index].sort((a, b) => b.updatedAt - a.updatedAt);
  const keep = sorted.filter((g, i) => i < MAX_GAMES || current.has(g.id));
  const drop = sorted.filter((g) => !keep.includes(g));
  await Promise.all(drop.map((g) => del(gameKey(g.id), db())));
  await set(INDEX, keep, db());
}

export const loadGame = (id: string) => safe(async () => parseSavedGame(await get(gameKey(id), db())), null);

/** The game to show for a grid size (the one last played at that size). */
export const loadCurrentGame = (size: number) =>
  safe(async () => {
    const id = await get(currentKey(size), db());
    return typeof id === "string" ? parseSavedGame(await get(gameKey(id), db())) : null;
  }, null);

/** Save a game, make it current for its size, and refresh the History index. */
export const saveGame = (game: SavedGame) =>
  safe(async () => {
    await set(gameKey(game.id), game, db());
    await set(currentKey(game.size), game.id, db());
    await update<GameSummary[]>(
      INDEX,
      (list = []) => [summarize(game), ...list.filter((g) => g.id !== game.id)],
      db(),
    );
    await prune();
  }, undefined);

/** Delete a game from History. */
export const removeGame = (id: string) =>
  safe(async () => {
    const game = parseSavedGame(await get(gameKey(id), db()));
    await del(gameKey(id), db());
    await update<GameSummary[]>(INDEX, (list = []) => list.filter((g) => g.id !== id), db());
    if (game && (await get(currentKey(game.size), db())) === id) await del(currentKey(game.size), db());
  }, undefined);

/** All saved games, most recently played first. */
export const listGames = () =>
  safe(async () => (await readIndex()).sort((a, b) => b.updatedAt - a.updatedAt), [] as GameSummary[]);

/** Sizes whose current game is unfinished (marked in the size picker). */
export const listInProgressSizes = () =>
  safe(async () => {
    const [index, current] = await Promise.all([readIndex(), readCurrentIds()]);
    return index.filter((g) => current.has(g.id) && g.status === "playing").map((g) => g.size);
  }, [] as number[]);

export const loadLastSize = () =>
  safe(async () => {
    const v = await get(LAST_SIZE, db());
    return typeof v === "number" ? v : null;
  }, null);

export const saveLastSize = (size: number) => safe(() => set(LAST_SIZE, size, db()), undefined);

export const recordCompleted = (game: CompletedGame) =>
  safe(
    () => update<CompletedGame[]>(COMPLETED, (list = []) => [...list, game].slice(-MAX_COMPLETED), db()),
    undefined,
  );

export const loadCompleted = () =>
  safe(async () => ((await get(COMPLETED, db())) as CompletedGame[] | undefined) ?? [], [] as CompletedGame[]);

/** Upgrade v1 saves and remove games for sizes no longer offered. Safe to run every boot. */
export const migrateLegacySaves = () =>
  safe(async () => {
    const legacy = (await keys(db())).filter((k): k is string => typeof k === "string" && /^game:\d+$/.test(k));
    for (const key of legacy) {
      const game = parseSavedGame(await get(key, db()));
      if (game) {
        await set(gameKey(game.id), game, db());
        await set(currentKey(game.size), game.id, db());
        await update<GameSummary[]>(INDEX, (list = []) => [summarize(game), ...list.filter((g) => g.id !== game.id)], db());
      }
      await del(key, db());
    }

    // Drop games for sizes the app no longer offers (4×4 was removed).
    const supported = (n: number) => SUPPORTED_SIZES.includes(n as (typeof SUPPORTED_SIZES)[number]);
    const index = await readIndex();
    const stale = index.filter((g) => !supported(g.size));
    if (stale.length > 0) {
      await Promise.all(stale.map((g) => del(gameKey(g.id), db())));
      await set(INDEX, index.filter((g) => supported(g.size)), db());
    }
    const pointers = (await keys(db())).filter(
      (k): k is string => typeof k === "string" && k.startsWith("meta:current:") && !supported(Number(k.slice(13))),
    );
    await Promise.all(pointers.map((k) => del(k, db())));
  }, undefined);
