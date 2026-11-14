/**
 * Where new puzzles come from, on the main thread:
 *   1. the server's puzzle bank (instant, shareable), if it answers quickly;
 *   2. otherwise a Web Worker that generates one on this device.
 * Generation falls back to the main thread if workers aren't available.
 */
import {
  decodeGrid,
  generatePuzzle,
  specFor,
  type Difficulty,
  type GeneratedPuzzle,
} from "@/lib/engine";
import { loadSeenBankIds } from "@/lib/save/storage";

/** A puzzle ready to play, wherever it came from. */
export interface DealtPuzzle {
  puzzle: number[];
  solution: number[];
  difficulty: Difficulty;
  /** Bank id (shareable as /p/<id>), or null for locally generated puzzles. */
  bankId: string | null;
}

const BANK_TIMEOUT_MS = 2000;

// ── Bank ─────────────────────────────────────────────────────────────────────

/** Validate a bank response: it comes from the network, so check everything. */
function fromBankResponse(data: unknown, size?: number): DealtPuzzle | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.id !== "string" || typeof d.size !== "number" || typeof d.difficulty !== "string") return null;
  if (size !== undefined && d.size !== size) return null;
  if (typeof d.givens !== "string" || typeof d.solution !== "string") return null;
  const puzzle = decodeGrid(d.givens, d.size);
  const solution = decodeGrid(d.solution, d.size);
  if (!puzzle || !solution || solution.includes(0)) return null;
  if (!puzzle.every((v, i) => v === 0 || v === solution[i])) return null;
  if (!["easy", "medium", "hard", "expert"].includes(d.difficulty)) return null;
  return { puzzle, solution, difficulty: d.difficulty as Difficulty, bankId: d.id };
}

async function fetchJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BANK_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null; // offline, timed out, or the bank is down
  } finally {
    clearTimeout(timer);
  }
}

async function fromBank(size: number, difficulty: Difficulty): Promise<DealtPuzzle | null> {
  const seen = await loadSeenBankIds();
  const params = new URLSearchParams({ size: String(size), difficulty });
  if (seen.length) params.set("exclude", seen.join(","));
  return fromBankResponse(await fetchJson(`/api/puzzles/next?${params}`), size);
}

/** A specific bank puzzle, for share links. */
export async function fetchSharedPuzzle(id: string): Promise<DealtPuzzle | null> {
  if (!/^[0-9a-z]{8}$/.test(id)) return null;
  return fromBankResponse(await fetchJson(`/api/puzzles/${id}`));
}

// ── Local generation ─────────────────────────────────────────────────────────

type Reply = { id: number; ok: true; result: GeneratedPuzzle } | { id: number; ok: false; error: string };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (g: GeneratedPuzzle) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === "undefined") return null;
  try {
    worker = new Worker(new URL("../workers/generate.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<Reply>) => {
      const reply = event.data;
      const job = pending.get(reply.id);
      if (!job) return;
      pending.delete(reply.id);
      if (reply.ok) job.resolve(reply.result);
      else job.reject(new Error(reply.error));
    };
    worker.onerror = (event) => {
      for (const job of pending.values()) job.reject(new Error(event.message || "Puzzle worker failed"));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
    return worker;
  } catch {
    return null;
  }
}

export function generateLocally(size: number, seed: number, difficulty: Difficulty): Promise<GeneratedPuzzle> {
  const w = getWorker();
  if (!w) {
    // Fallback: generate here (blocks briefly). Deferred so the UI can show its spinner first.
    return new Promise((resolve, reject) =>
      setTimeout(() => {
        try {
          resolve(generatePuzzle(specFor(size), seed, difficulty));
        } catch (error) {
          reject(error as Error);
        }
      }, 30),
    );
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, size, seed, difficulty });
  });
}

// ── Entry point ──────────────────────────────────────────────────────────────

export async function dealPuzzle(size: number, seed: number, difficulty: Difficulty): Promise<DealtPuzzle> {
  const banked = await fromBank(size, difficulty);
  if (banked) return banked;
  const g = await generateLocally(size, seed, difficulty);
  return { puzzle: g.puzzle, solution: g.solution, difficulty: g.difficulty, bankId: null };
}
