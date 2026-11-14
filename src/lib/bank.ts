/**
 * Puzzle bank (server only): pre-generated, graded puzzles in Postgres.
 */
import { randomBytes } from "node:crypto";
import { DIFFICULTIES, difficultiesFor, SUPPORTED_SIZES, type Difficulty } from "@/lib/engine";
import { prisma } from "./db";

/** Ids are 8 lowercase base-36 characters, e.g. "k3x9q2ab". */
export const PUZZLE_ID = /^[0-9a-z]{8}$/;

export function newPuzzleId(): string {
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => "0123456789abcdefghijklmnopqrstuvwxyz"[b % 36]).join("");
}

/** What the API returns: grids in the compact text form (see engine/encode). */
export interface BankPuzzle {
  id: string;
  size: number;
  difficulty: Difficulty;
  givens: string;
  solution: string;
}

export function isOffered(size: number, difficulty: string): difficulty is Difficulty {
  return (
    SUPPORTED_SIZES.includes(size as (typeof SUPPORTED_SIZES)[number]) &&
    DIFFICULTIES.includes(difficulty as Difficulty) &&
    difficultiesFor(size).includes(difficulty as Difficulty)
  );
}

/** A random puzzle of this size and difficulty, skipping ids the player has already had. */
export async function pickPuzzle(size: number, difficulty: Difficulty, exclude: string[]): Promise<BankPuzzle | null> {
  const rows = await prisma.$queryRaw<BankPuzzle[]>`
    SELECT id, size, difficulty, givens, solution
    FROM "puzzle"
    WHERE size = ${size} AND difficulty = ${difficulty} AND NOT (id = ANY(${exclude}::text[]))
    ORDER BY random()
    LIMIT 1`;
  return rows[0] ?? null;
}

export async function getPuzzle(id: string): Promise<BankPuzzle | null> {
  const row = await prisma.puzzle.findUnique({
    where: { id },
    select: { id: true, size: true, difficulty: true, givens: true, solution: true },
  });
  return row && isOffered(row.size, row.difficulty) ? (row as BankPuzzle) : null;
}
