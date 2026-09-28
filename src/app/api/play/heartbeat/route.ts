import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { games } from "@/lib/db/schema";
import { getPlayerKey } from "@/lib/auth";
import { recordHeartbeat } from "@/lib/play";
import { bad, readJson } from "../../_util";

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body || typeof body.gameId !== "string") return bad("gameId required");
  const [game] = await db.select({ id: games.id, status: games.status, freeToPlay: games.freeToPlay }).from(games).where(eq(games.id, body.gameId));
  if (!game || game.status !== "published") return bad("unknown game", 404);
  const { key, user } = await getPlayerKey();
  const isPro = user?.plan === "pro";
  if (!isPro && !game.freeToPlay) return bad("subscription required", 402);
  const r = await recordHeartbeat(key, game.id, isPro);
  return NextResponse.json({ credited: r.credited, capped: r.capped, remaining: Number.isFinite(r.remaining) ? r.remaining : null });
}
