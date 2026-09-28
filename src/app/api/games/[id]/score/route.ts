import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { games, scores } from "@/lib/db/schema";
import { getUser } from "@/lib/auth";
import { newId } from "@/lib/ids";
import { bad, readJson } from "../../../_util";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await readJson(req);
  const user = await getUser();
  if (!user) return bad("sign in to save scores", 401);
  const score = Number(body?.score);
  if (!Number.isInteger(score) || score < 0 || score > 1_000_000_000) return bad("invalid score");
  const { id } = await params;
  const [game] = await db.select({ id: games.id, status: games.status }).from(games).where(eq(games.id, id));
  if (!game || game.status !== "published") return bad("unknown game", 404);
  // Only keep personal bests, and at most one submission every few seconds per player.
  const [prev] = await db
    .select({ best: sql<number>`max(${scores.score})::int`, last: sql<Date>`max(${scores.createdAt})` })
    .from(scores)
    .where(and(eq(scores.gameId, id), eq(scores.userId, user.id)));
  if (prev?.last && Date.now() - new Date(prev.last).getTime() < 3000) return NextResponse.json({ best: false, throttled: true });
  if (prev?.best != null && score <= Number(prev.best)) return NextResponse.json({ best: false });
  await db.insert(scores).values({ id: newId(), gameId: id, userId: user.id, score });
  const [rank] = await db
    .select({ n: sql<number>`count(distinct ${scores.userId})::int` })
    .from(scores)
    .where(and(eq(scores.gameId, id), sql`${scores.score} > ${score}`));
  return NextResponse.json({ best: true, rank: Number(rank.n) + 1 });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await db.select().from(scores).where(eq(scores.gameId, id)).orderBy(desc(scores.score)).limit(20);
  return NextResponse.json(rows);
}
