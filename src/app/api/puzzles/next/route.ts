import { NextResponse, type NextRequest } from "next/server";
import { isOffered, pickPuzzle, PUZZLE_ID } from "@/lib/bank";

const MAX_EXCLUDE = 300;

/**
 * GET /api/puzzles/next?size=9&difficulty=hard&exclude=id1,id2
 * A random bank puzzle the player hasn't had. 404 when the bank has none
 * left (the client then generates locally); 503 if the database is down.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const size = Number(params.get("size"));
  const difficulty = params.get("difficulty") ?? "";
  if (!isOffered(size, difficulty)) {
    return NextResponse.json({ error: "Unsupported size or difficulty" }, { status: 400 });
  }
  const exclude = (params.get("exclude") ?? "")
    .split(",")
    .filter((id) => PUZZLE_ID.test(id))
    .slice(0, MAX_EXCLUDE);

  try {
    const puzzle = await pickPuzzle(size, difficulty, exclude);
    if (!puzzle) return NextResponse.json({ error: "No puzzle available" }, { status: 404 });
    return NextResponse.json(puzzle, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[bank] next failed:", error);
    return NextResponse.json({ error: "Puzzle bank unavailable" }, { status: 503 });
  }
}
