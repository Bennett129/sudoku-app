/**
 * Local game storage in IndexedDB (via idb-keyval).
 *
 * Layout (one key-value store):
 *   game:<id>            full SavedGame
 *   meta:index           GameSummary[] for the History list (newest first)
 *   meta:current:<size>  id of the game shown for that grid size
 *   meta:lastSize        size to reopen on the next visit
 *   completed            CompletedGame[] for stats
 *   sync:*               sync bookkeeping (bottom of this file)
 *
 * At most MAX_GAMES games are kept; the oldest are pruned, but never a game
 * that is current for some size. Every call swallows storage errors (private
 * browsing, blocked site data, quota) so the game always stays playable.
 */
import { createStore, del, get, keys, set, update, type UseStore } from "idb-keyval";
import { SUPPORTED_SIZES } from "@/lib/engine";
import { forSync, isNewer, mergeCompleted, type Tombstone } from "@/lib/sync/protocol";
import { hasProgress, parseSavedGame, summarize, type CompletedGame, type GameSummary, type SavedGame } from "./serialize";

export const MAX_GAMES = 50;
const MAX_COMPLETED = 1000;

let store: UseStore | null = null;
const db = () => (store ??= createStore("sudoku", "kv"));

const gameKey = (id: string) => `game:${id}`;
const currentKey = (size: number) => `meta:current:${size}`;
const INDEX = "meta:index";
const LAST_SIZE = "meta:lastSize";
const COMPLETED = "completed";
/** Bank puzzle ids already dealt to this device, so the bank doesn't repeat them. */
const SEEN_BANK = "meta:seenBank";
const MAX_SEEN_BANK = 300;

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

/** Delete a game from History (and, once synced, from the account). */
export const removeGame = (id: string) =>
  safe(async () => {
    const game = parseSavedGame(await get(gameKey(id), db()));
    await del(gameKey(id), db());
    await update<GameSummary[]>(INDEX, (list = []) => list.filter((g) => g.id !== id), db());
    if (game && (await get(currentKey(game.size), db())) === id) await del(currentKey(game.size), db());
    await update<Tombstone[]>(
      REMOVED,
      (list = []) => [...list.filter((t) => t.id !== id), { id, at: Date.now() }].slice(-MAX_REMOVED),
      db(),
    );
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

export const loadSeenBankIds = () =>
  safe(async () => {
    const list = await get(SEEN_BANK, db());
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  }, [] as string[]);

export const markBankSeen = (id: string) =>
  safe(
    () =>
      update<string[]>(SEEN_BANK, (list = []) => [...list.filter((x) => x !== id), id].slice(-MAX_SEEN_BANK), db()),
    undefined,
  );

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

// ---------------------------------------------------------------------------
// Sync bookkeeping (see src/store/sync.ts)
//   sync:state    { userId, cursor, pushedAt } for the signed-in account
//   sync:removed  Tombstone[] of games deleted here, until the account has them

export interface SyncState {
  userId: string;
  /** Server cursor from the last successful pull. */
  cursor: number;
  /** Device time up to which local changes have been pushed. */
  pushedAt: number;
}

const SYNC_STATE = "sync:state";
const REMOVED = "sync:removed";
const MAX_REMOVED = 200;

export const loadSyncState = () =>
  safe(async () => {
    const s = (await get(SYNC_STATE, db())) as Partial<SyncState> | undefined;
    return s && typeof s.userId === "string" && typeof s.cursor === "number" && typeof s.pushedAt === "number"
      ? (s as SyncState)
      : null;
  }, null);

export const saveSyncState = (state: SyncState) => safe(() => set(SYNC_STATE, state, db()), undefined);

export const loadRemoved = () =>
  safe(async () => ((await get(REMOVED, db())) as Tombstone[] | undefined) ?? [], [] as Tombstone[]);

/** Forget deletions the account now has. */
export const clearRemoved = (ids: string[]) =>
  safe(
    () => update<Tombstone[]>(REMOVED, (list = []) => list.filter((t) => !ids.includes(t.id)), db()),
    undefined,
  );

/** Saved games changed after `since` (device time), oldest first, ready to upload. */
export const gamesChangedSince = (since: number) =>
  safe(async () => {
    const changed = (await readIndex()).filter((g) => g.updatedAt > since).sort((a, b) => a.updatedAt - b.updatedAt);
    const games = await Promise.all(changed.map((g) => get(gameKey(g.id), db()).then(parseSavedGame)));
    return games.filter((g): g is SavedGame => g !== null).map(forSync);
  }, [] as SavedGame[]);

/**
 * Store games from the account where they're newer than this device's copy.
 * A newer game also becomes current for its size, so switching to that size
 * (or reloading) continues where the other device left off.
 * Returns the ids that changed.
 */
export const applyRemoteGames = (games: SavedGame[]) =>
  safe(async () => {
    const changed: string[] = [];
    for (const game of games) {
      const local = parseSavedGame(await get(gameKey(game.id), db()));
      if (local && !isNewer(game, local)) continue;
      await set(gameKey(game.id), game, db());
      await update<GameSummary[]>(INDEX, (list = []) => [summarize(game), ...list.filter((g) => g.id !== game.id)], db());
      const currentId = await get(currentKey(game.size), db());
      const current = typeof currentId === "string" ? parseSavedGame(await get(gameKey(currentId), db())) : null;
      // An untouched game (e.g. the one a new device dealt on first load) gives way
      // to a game that has progress, even if it was dealt more recently.
      const untouched = current && current.hintsUsed === 0 && !hasProgress(current);
      if (
        !current ||
        current.id === game.id ||
        isNewer(game, current) ||
        (untouched && (hasProgress(game) || game.status === "solved"))
      ) {
        await set(currentKey(game.size), game.id, db());
      }
      changed.push(game.id);
    }
    if (changed.length > 0) await prune();
    return changed;
  }, [] as string[]);

/** Delete games another device deleted, unless they were changed here afterwards. */
export const applyRemoteRemovals = (tombstones: Tombstone[], keepId: string | null) =>
  safe(async () => {
    let count = 0;
    for (const t of tombstones) {
      if (t.id === keepId) continue; // never pull the board out from under the player
      const local = parseSavedGame(await get(gameKey(t.id), db()));
      if (!local || local.movedAt > t.at) continue;
      await del(gameKey(t.id), db());
      await update<GameSummary[]>(INDEX, (list = []) => list.filter((g) => g.id !== t.id), db());
      if ((await get(currentKey(local.size), db())) === t.id) await del(currentKey(local.size), db());
      count++;
    }
    return count;
  }, 0);

/** Add finished games from the account to this device's stats (no duplicates). */
export const mergeRemoteCompleted = (records: CompletedGame[]) =>
  safe(async () => {
    if (records.length === 0) return;
    await update<CompletedGame[]>(COMPLETED, (list = []) => mergeCompleted(list, records, MAX_COMPLETED), db());
  }, undefined);
