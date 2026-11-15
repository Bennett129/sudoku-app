/**
 * Keeps the current game saved on the device and gives access to past games.
 *
 * - Every game is saved under its own id; the last one played at each size is
 *   "current" for that size, so switching sizes resumes it.
 * - Saves at most every SAVE_INTERVAL ms while playing, immediately on a new
 *   game, size switch, reopen or solve, and flushes when the tab is hidden.
 * - The last played size is reopened on the next visit.
 * - Finished games are appended to a "completed" list for stats.
 */
import { create } from "zustand";
import { SUPPORTED_SIZES } from "@/lib/engine";
import { toSavedGame } from "@/lib/save/serialize";
import * as storage from "@/lib/save/storage";
import { fetchSharedPuzzle } from "@/lib/generate-client";
import { useGame } from "./game";

const SAVE_INTERVAL = 1500;
const DEFAULT_SIZE = 9;

interface SavesState {
  /** Sizes whose current game is unfinished, shown in the size picker. */
  inProgress: number[];
  /** Bumped after every write so views like History can refresh. */
  revision: number;
}

export const useSaves = create<SavesState>()(() => ({ inProgress: [], revision: 0 }));

let timer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;
/** Set while showing a game that just arrived from the account, so it isn't re-saved as a local change. */
let quiet = false;

let markBooted: () => void;
/** Resolves once the first game is on screen and old saves are upgraded. */
export const booted = new Promise<void>((resolve) => (markBooted = resolve));

export async function refreshSaves() {
  const inProgress = await storage.listInProgressSizes();
  useSaves.setState((s) => ({ inProgress, revision: s.revision + 1 }));
}

export async function saveNow(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  dirty = false;
  const saved = toSavedGame(useGame.getState());
  if (!saved) return;
  await storage.saveGame(saved);
  await refreshSaves();
}

function scheduleSave() {
  dirty = true;
  timer ??= setTimeout(() => void saveNow(), SAVE_INTERVAL);
}

/** Start watching the game store. Returns a cleanup function. */
export function startAutosave(): () => void {
  const unsubscribe = useGame.subscribe((state, prev) => {
    if (state.status === "loading" || quiet) return;

    // A different game is now showing (new puzzle, size switch, reopened from History).
    if (state.id !== prev.id) {
      void saveNow();
      void storage.saveLastSize(state.spec.size);
      return;
    }

    if (prev.status === "playing" && state.status === "solved") {
      void storage.recordCompleted({
        size: state.spec.size,
        difficulty: state.difficulty,
        seed: state.seed,
        elapsed: state.elapsed,
        hintsUsed: state.hintsUsed,
        completedAt: Date.now(),
      });
      void saveNow();
      return;
    }

    scheduleSave();
  });

  const flush = () => {
    if (dirty) void saveNow();
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") flush();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", flush);

  return () => {
    unsubscribe();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", flush);
    flush();
  };
}

/** Switch grid size, resuming the game last played at that size if there is one. */
export async function openSize(size: number): Promise<void> {
  const game = useGame.getState();
  if (game.status !== "loading" && game.spec.size === size) return;
  if (dirty) await saveNow();
  const saved = await storage.loadCurrentGame(size);
  if (saved) useGame.getState().restore(saved);
  else useGame.getState().newGame(size);
}

/** Reopen a game from History. Returns false if it could not be loaded. */
export async function openGame(id: string): Promise<boolean> {
  if (useGame.getState().id === id) return true;
  if (dirty) await saveNow();
  const saved = await storage.loadGame(id);
  if (!saved) return false;
  useGame.getState().restore(saved);
  return true;
}

/** Remove a past game. The game currently on screen can't be removed. */
export async function deleteGame(id: string): Promise<void> {
  if (useGame.getState().id === id) return;
  await storage.removeGame(id);
  await refreshSaves();
}

/**
 * Open a shared bank puzzle (/p/<id>): resume this device's saved copy if
 * there is one, otherwise fetch it from the bank. False if it can't be found.
 */
export async function openShared(bankId: string): Promise<boolean> {
  if (dirty) await saveNow();
  const saved = await storage.loadGame(`p-${bankId}`);
  if (saved) {
    useGame.getState().restore(saved);
    return true;
  }
  const dealt = await fetchSharedPuzzle(bankId);
  if (!dealt) return false;
  useGame.getState().startPuzzle(dealt);
  return true;
}

/**
 * First load: upgrade old saves, then open the shared puzzle if the URL has
 * one, else reopen the last played size (or 9×9). Returns false if a shared
 * puzzle was requested but couldn't be opened.
 */
export async function bootGame(sharedId?: string): Promise<boolean> {
  await storage.migrateLegacySaves();
  const lastSize = await storage.loadLastSize();
  await refreshSaves();
  if (sharedId && (await openShared(sharedId))) return true;
  if (useGame.getState().status !== "loading") return !sharedId; // the player already started something
  const size = SUPPORTED_SIZES.includes(lastSize as (typeof SUPPORTED_SIZES)[number]) ? lastSize! : DEFAULT_SIZE;
  await openSize(size);
  return !sharedId;
}

/** Mark start-up finished (called by the game screen after bootGame). */
export const finishBoot = () => markBooted();

/**
 * After a sync brought in games from another device: if the game on screen
 * changed there, or another game at this size was played more recently,
 * show that one. Unsaved local changes (at most a second or two of play)
 * lose to the newer remote game, as last-write-wins would decide anyway.
 */
export async function followRemote(changedIds: string[]): Promise<void> {
  if (changedIds.length === 0) return;
  const g = useGame.getState();
  if (g.status === "loading" || g.generating) return;
  const current = await storage.loadCurrentGame(g.spec.size);
  if (!current || !changedIds.includes(current.id)) return;
  const now = useGame.getState();
  if (now.id !== g.id || now.generating) return; // the player moved on meanwhile
  if (timer) clearTimeout(timer);
  timer = null;
  dirty = false;
  quiet = true;
  try {
    now.restore(current);
  } finally {
    quiet = false;
  }
}
