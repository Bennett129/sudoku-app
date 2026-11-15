/**
 * Server side of sync: apply one device's changes to the account, then
 * return what changed since the device's cursor. See protocol.ts.
 *
 * Writes are last-write-wins upserts done in SQL, so two devices syncing at
 * the same moment can't overwrite a newer change with an older one.
 *
 * The cursor is the database clock at the start of the request, minus an
 * overlap. Rows written by a slower concurrent request may carry an earlier
 * syncedAt than ours; the overlap returns them again next time rather than
 * missing them, and re-applying a change is harmless.
 */
import { prisma } from "@/lib/db";
import { parseSavedGame } from "@/lib/save/serialize";
import { parseSettings } from "@/lib/settings";
import { ACCOUNT_LIMITS, type SyncRequest, type SyncResponse } from "./protocol";

const CURSOR_OVERLAP_MS = 5_000;

export async function runSync(userId: string, req: SyncRequest): Promise<SyncResponse> {
  const [{ now }] = await prisma.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
  const cursor = Math.max(0, now.getTime() - CURSOR_OVERLAP_MS);

  await push(userId, req);
  if (req.pull === false) return { cursor: req.cursor, settings: null, games: [], removed: [], completed: [] };
  return { cursor, ...(await pull(userId, new Date(req.cursor))) };
}

async function push(userId: string, req: SyncRequest) {
  if (req.settings) {
    const { data, updatedAt } = req.settings;
    await prisma.$executeRaw`
      INSERT INTO "user_settings" ("userId", "data", "updatedAt", "syncedAt")
      VALUES (${userId}, ${JSON.stringify(data)}::jsonb, ${updatedAt}::bigint, now())
      ON CONFLICT ("userId") DO UPDATE
        SET "data" = EXCLUDED."data", "updatedAt" = EXCLUDED."updatedAt", "syncedAt" = now()
        WHERE "user_settings"."updatedAt" < EXCLUDED."updatedAt"`;
  }

  // Games and deletions share one upsert: a deletion is a write with no data.
  const writes = [
    ...req.games.map((g) => ({ id: g.id, data: JSON.stringify(g) as string | null, at: g.movedAt })),
    ...req.removed.map((t) => ({ id: t.id, data: null, at: t.at })),
  ];
  for (const w of writes) {
    await prisma.$executeRaw`
      INSERT INTO "synced_game" ("userId", "gameId", "data", "updatedAt", "syncedAt")
      VALUES (${userId}, ${w.id}, ${w.data}::jsonb, ${w.at}::bigint, now())
      ON CONFLICT ("userId", "gameId") DO UPDATE
        SET "data" = EXCLUDED."data", "updatedAt" = EXCLUDED."updatedAt", "syncedAt" = now()
        WHERE "synced_game"."updatedAt" < EXCLUDED."updatedAt"
           OR ("synced_game"."updatedAt" = EXCLUDED."updatedAt"
               AND ("synced_game"."data"->>'elapsed')::int < (EXCLUDED."data"->>'elapsed')::int)`;
  }

  if (req.completed.length > 0) {
    await prisma.solve.createMany({
      data: req.completed.map((c) => ({
        userId,
        size: c.size,
        difficulty: c.difficulty ?? null,
        seed: BigInt(c.seed),
        elapsed: c.elapsed,
        hintsUsed: c.hintsUsed,
        completedAt: BigInt(c.completedAt),
      })),
      skipDuplicates: true, // the same solve arriving from two devices, or a retried request
    });
  }

  if (writes.length > 0) await pruneGames(userId);
  if (req.completed.length > 0) await pruneSolves(userId);
}

/** Keep the newest games and tombstones; older ones are simply dropped from the account. */
async function pruneGames(userId: string) {
  await prisma.$executeRaw`
    DELETE FROM "synced_game" WHERE "userId" = ${userId} AND "gameId" IN (
      SELECT "gameId" FROM "synced_game" WHERE "userId" = ${userId} AND "data" IS NOT NULL
      ORDER BY "updatedAt" DESC OFFSET ${ACCOUNT_LIMITS.games})`;
  await prisma.$executeRaw`
    DELETE FROM "synced_game" WHERE "userId" = ${userId} AND "gameId" IN (
      SELECT "gameId" FROM "synced_game" WHERE "userId" = ${userId} AND "data" IS NULL
      ORDER BY "updatedAt" DESC OFFSET ${ACCOUNT_LIMITS.tombstones})`;
}

async function pruneSolves(userId: string) {
  await prisma.$executeRaw`
    DELETE FROM "solve" WHERE "id" IN (
      SELECT "id" FROM "solve" WHERE "userId" = ${userId}
      ORDER BY "completedAt" DESC OFFSET ${ACCOUNT_LIMITS.completed})`;
}

async function pull(userId: string, since: Date): Promise<Omit<SyncResponse, "cursor">> {
  const [settings, games, solves] = await Promise.all([
    prisma.userSettings.findFirst({ where: { userId, syncedAt: { gt: since } } }),
    prisma.syncedGame.findMany({ where: { userId, syncedAt: { gt: since } } }),
    prisma.solve.findMany({ where: { userId, syncedAt: { gt: since } }, orderBy: { completedAt: "asc" } }),
  ]);

  const settingsData = settings ? parseSettings(settings.data) : null;
  return {
    settings: settingsData ? { data: settingsData, updatedAt: Number(settings!.updatedAt) } : null,
    // Re-validate on the way out too, in case the stored format ever changes.
    games: games.flatMap((g) => {
      if (g.data === null) return [];
      const parsed = parseSavedGame(g.data);
      return parsed ? [parsed] : [];
    }),
    removed: games.filter((g) => g.data === null).map((g) => ({ id: g.gameId, at: Number(g.updatedAt) })),
    completed: solves.map((s) => ({
      size: s.size,
      difficulty: (s.difficulty as SyncResponse["completed"][number]["difficulty"]) ?? null,
      seed: Number(s.seed),
      elapsed: s.elapsed,
      hintsUsed: s.hintsUsed,
      completedAt: Number(s.completedAt),
    })),
  };
}
