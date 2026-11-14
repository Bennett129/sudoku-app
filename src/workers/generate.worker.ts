/// <reference lib="webworker" />
/**
 * Generates puzzles off the main thread so the page never freezes, even for
 * 25×25 puzzles that take several seconds.
 */
import { generatePuzzle, specFor, type Difficulty } from "@/lib/engine";

export interface GenerateRequest {
  id: number;
  size: number;
  seed: number;
  difficulty: Difficulty;
}

self.onmessage = (event: MessageEvent<GenerateRequest>) => {
  const { id, size, seed, difficulty } = event.data;
  try {
    const result = generatePuzzle(specFor(size), seed, difficulty);
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error) });
  }
};
