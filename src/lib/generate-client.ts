/**
 * Main-thread side of puzzle generation. Uses one long-lived Web Worker;
 * falls back to generating on the main thread if workers aren't available.
 */
import { generatePuzzle, specFor, type Difficulty, type GeneratedPuzzle } from "@/lib/engine";

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

export function requestPuzzle(size: number, seed: number, difficulty: Difficulty): Promise<GeneratedPuzzle> {
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
