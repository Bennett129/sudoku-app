/**
 * Top up the puzzle bank so every size × difficulty has at least a target
 * number of puzzles.
 *
 *   npm run bank:fill                          # all sizes, default targets
 *   npm run bank:fill -- --sizes 9,16 --target 20
 *   npm run bank:fill -- --minutes 10          # stop after 10 minutes
 *
 * A puzzle that comes out easier than the difficulty it was generated for
 * isn't wasted: it's stored under its actual rating if that bucket still
 * needs puzzles. Every stored puzzle is re-verified to have exactly one
 * solution (logical proof plus a brute-force check; see verifyUnique).
 *
 * Needs DATABASE_URL (read from .env if present). Exits quietly without it,
 * so the scheduled GitHub Action is harmless until a database is configured.
 */
import { existsSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  difficultiesFor,
  encodeGrid,
  generatePuzzle,
  randomSeed,
  specFor,
  SUPPORTED_SIZES,
  verifyUnique,
  type Difficulty,
} from "../src/lib/engine";
import { newPuzzleId } from "../src/lib/bank";
import { PrismaClient } from "../src/generated/prisma/client";

if (existsSync(".env")) process.loadEnvFile(".env");

/** Default bucket targets: plenty for common sizes, fewer for slow big grids. */
const DEFAULT_TARGET: Record<number, number> = { 6: 40, 8: 30, 9: 60, 10: 30, 12: 30, 15: 15, 16: 20, 20: 8, 25: 6 };

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("DATABASE_URL not set; nothing to do.");
    return;
  }
  const sizes = arg("sizes")?.split(",").map(Number) ?? [...SUPPORTED_SIZES];
  const targetOverride = arg("target") ? Number(arg("target")) : null;
  const deadline = Date.now() + Number(arg("minutes") ?? 30) * 60_000;

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    for (const size of sizes) {
      const spec = specFor(size);
      const target = targetOverride ?? DEFAULT_TARGET[size] ?? 10;
      const counts = new Map<Difficulty, number>();
      for (const d of difficultiesFor(size)) counts.set(d, await prisma.puzzle.count({ where: { size, difficulty: d } }));

      for (const wanted of difficultiesFor(size)) {
        while ((counts.get(wanted) ?? 0) < target) {
          if (Date.now() > deadline) {
            console.log("Time limit reached.");
            return;
          }
          const started = Date.now();
          const g = generatePuzzle(spec, randomSeed(), wanted);
          // Store under its actual rating if that bucket still has room.
          const bucket = g.difficulty;
          if ((counts.get(bucket) ?? Infinity) >= target) continue;
          if (!verifyUnique(spec, g.puzzle, g.solution)) throw new Error("Generator produced a puzzle that failed verification");

          try {
            await prisma.puzzle.create({
              data: {
                id: newPuzzleId(),
                size,
                difficulty: bucket,
                givens: encodeGrid(g.puzzle),
                solution: encodeGrid(g.solution),
                techniques: g.techniques,
              },
            });
            counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
            console.log(
              `${size}×${size} ${bucket.padEnd(6)} ${counts.get(bucket)}/${target}  (${Date.now() - started} ms${bucket !== wanted ? `, wanted ${wanted}` : ""})`,
            );
          } catch (error) {
            // Unique-constraint clash (duplicate puzzle): just skip it.
            if (!String(error).includes("Unique constraint")) throw error;
          }
        }
      }
    }
    console.log("Bank is topped up.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
