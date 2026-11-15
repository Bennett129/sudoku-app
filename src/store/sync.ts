/**
 * Keeps a signed-in player's games, stats and settings in their account.
 *
 * - On sign-in (and every page load while signed in) everything on this
 *   device that the account hasn't seen is uploaded, so games played before
 *   signing in are kept, and the account's changes are downloaded.
 * - After that, local changes are pushed a few seconds after they happen,
 *   immediately when the tab is hidden, and the account is checked again
 *   whenever the tab comes back into view.
 * - Signing out stops syncing; games stay on this device.
 *
 * If a different account signs in on the same device, this device's games
 * are merged into that account too: local saves aren't tied to an account.
 */
import { create } from "zustand";
import { pickSettings } from "@/lib/settings";
import * as storage from "@/lib/save/storage";
import {
  chunk,
  parseSyncResponse,
  SYNC_LIMITS,
  type SyncRequest,
  type SyncResponse,
} from "@/lib/sync/protocol";
import { booted, followRemote, refreshSaves, saveNow, useSaves } from "./autosave";
import { useGame } from "./game";
import { useSettings } from "./settings";

const PUSH_DELAY = 5_000;
const RETRY_DELAY = 30_000;
const PULL_ON_FOCUS_AFTER = 15_000;
/** fetch keepalive bodies are capped at 64 KB by browsers. */
const KEEPALIVE_LIMIT = 60_000;

export type SyncStatus = "off" | "syncing" | "synced" | "error";

interface SyncStore {
  status: SyncStatus;
  /** Signed-in user being synced, or null. */
  userId: string | null;
  lastSyncedAt: number | null;
}

export const useSync = create<SyncStore>()(() => ({ status: "off", userId: null, lastSyncedAt: null }));

let timer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<void> | null = null;
let again = false;
/** True while writing downloaded changes, so they don't trigger another push. */
let applying = false;
let stopListeners: (() => void) | null = null;

/** Start syncing for this user (idempotent). */
export function startSync(userId: string) {
  if (useSync.getState().userId === userId) return;
  stopSync();
  useSync.setState({ userId, status: "syncing" });

  const unsubSaves = useSaves.subscribe((s, p) => {
    if (s.revision !== p.revision && !applying) requestSync(PUSH_DELAY);
  });
  const unsubSettings = useSettings.subscribe((s, p) => {
    if (s.updatedAt !== p.updatedAt && !applying) requestSync(PUSH_DELAY);
  });
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      void flushOnHide();
    } else {
      const last = useSync.getState().lastSyncedAt ?? 0;
      if (Date.now() - last > PULL_ON_FOCUS_AFTER) requestSync(0);
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  stopListeners = () => {
    unsubSaves();
    unsubSettings();
    document.removeEventListener("visibilitychange", onVisibility);
  };

  // First sync once the local game is on screen, so there's something to compare with.
  void booted.then(() => requestSync(0));
}

export function stopSync() {
  stopListeners?.();
  stopListeners = null;
  if (timer) clearTimeout(timer);
  timer = null;
  useSync.setState({ userId: null, status: "off", lastSyncedAt: null });
}

/** Sync soon (coalesces with an already scheduled sync if that one is sooner). */
export function requestSync(delay: number) {
  if (!useSync.getState().userId) return;
  if (timer && delay > 0) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncNow();
  }, delay);
}

/** Run a sync now; resolves when it (and any sync queued behind it) finishes. */
export async function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await syncOnce();
    } while (again && useSync.getState().userId);
  })();
  try {
    await running;
  } finally {
    running = null;
  }
}

async function flushOnHide() {
  if (!useSync.getState().userId) return;
  await saveNow(); // the autosave flushes too; make sure it landed before reading it back
  await syncOnce({ keepalive: true });
}

async function syncOnce(opts: { keepalive?: boolean } = {}) {
  const userId = useSync.getState().userId;
  if (!userId) return;
  if (!opts.keepalive) useSync.setState({ status: "syncing" });

  const saved = await storage.loadSyncState();
  // A different account on this device: start over so local data merges into it.
  const state = saved?.userId === userId ? saved : { userId, cursor: 0, pushedAt: 0 };
  const startedAt = Date.now();

  const [games, removed, completed] = await Promise.all([
    storage.gamesChangedSince(state.pushedAt),
    storage.loadRemoved(),
    storage.loadCompleted().then((list) => list.filter((c) => c.completedAt > state.pushedAt)),
  ]);
  const s = useSettings.getState();
  const settings = s.updatedAt > state.pushedAt ? { data: pickSettings(s), updatedAt: s.updatedAt } : null;

  // Big first uploads go in several requests; only the last one pulls.
  const gameChunks = chunk(games, SYNC_LIMITS.games);
  const completedChunks = chunk(completed, SYNC_LIMITS.completed);
  const requests = Math.max(gameChunks.length, completedChunks.length);
  let cursor = state.cursor;
  try {
    for (let i = 0; i < requests; i++) {
      const last = i === requests - 1;
      const body: SyncRequest = {
        cursor,
        pull: last,
        settings: i === 0 ? settings : null,
        games: gameChunks[i] ?? [],
        removed: i === 0 ? removed.slice(-SYNC_LIMITS.removed) : [],
        completed: completedChunks[i] ?? [],
      };
      const json = JSON.stringify(body);
      if (opts.keepalive && json.length > KEEPALIVE_LIMIT) return; // too big to send while closing; next visit will
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: json,
        keepalive: opts.keepalive,
        credentials: "same-origin",
      });
      if (res.status === 401) {
        stopSync(); // signed out elsewhere or the session expired
        return;
      }
      if (!res.ok) throw new Error(`Sync failed: HTTP ${res.status}`);
      if (useSync.getState().userId !== userId) return; // signed out meanwhile
      if (last) {
        const data = parseSyncResponse(await res.json());
        if (!data) throw new Error("Sync failed: unexpected response");
        await applyPulled(data);
        cursor = data.cursor;
      }
    }

    await storage.saveSyncState({ userId, cursor, pushedAt: startedAt - 1 });
    await storage.clearRemoved(removed.map((t) => t.id));
    useSync.setState({ status: "synced", lastSyncedAt: Date.now() });
  } catch (error) {
    if (opts.keepalive) return;
    console.warn("[sync]", error);
    useSync.setState({ status: "error" });
    requestSync(RETRY_DELAY);
  }
}

async function applyPulled(data: SyncResponse) {
  applying = true;
  try {
    if (data.settings && data.settings.updatedAt > useSettings.getState().updatedAt) {
      useSettings.getState().applyRemote(data.settings.data, data.settings.updatedAt);
    }
    const changed = await storage.applyRemoteGames(data.games);
    const removed = await storage.applyRemoteRemovals(data.removed, useGame.getState().id || null);
    await storage.mergeRemoteCompleted(data.completed);
    if (changed.length > 0 || removed > 0 || data.completed.length > 0) await refreshSaves();
    await followRemote(changed);
  } finally {
    applying = false;
  }
}
