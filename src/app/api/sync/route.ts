import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseSyncRequest, SYNC_LIMITS } from "@/lib/sync/protocol";
import { runSync } from "@/lib/sync/server";

/**
 * POST /api/sync — push this device's changes and pull the account's.
 * Signed-in players only. Body and response: see src/lib/sync/protocol.ts.
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > SYNC_LIMITS.body) return NextResponse.json({ error: "Request too large" }, { status: 413 });

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > SYNC_LIMITS.body) return NextResponse.json({ error: "Request too large" }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseSyncRequest(body);
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });

  try {
    const result = await runSync(session.user.id, parsed);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[sync] failed:", error);
    return NextResponse.json({ error: "Sync unavailable" }, { status: 503 });
  }
}
