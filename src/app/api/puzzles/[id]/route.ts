import { NextResponse } from "next/server";
import { getPuzzle, PUZZLE_ID } from "@/lib/bank";

/** GET /api/puzzles/<id> — one bank puzzle, for share links. Puzzles never change, so it caches well. */
export async function GET(_request: Request, { params }: RouteContext<"/api/puzzles/[id]">) {
  const { id } = await params;
  if (!PUZZLE_ID.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  try {
    const puzzle = await getPuzzle(id);
    if (!puzzle) return NextResponse.json({ error: "Puzzle not found" }, { status: 404 });
    return NextResponse.json(puzzle, { headers: { "Cache-Control": "public, max-age=86400, immutable" } });
  } catch (error) {
    console.error("[bank] get failed:", error);
    return NextResponse.json({ error: "Puzzle bank unavailable" }, { status: 503 });
  }
}
