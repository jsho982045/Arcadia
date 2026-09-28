import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { games } from "@/lib/db/schema";
import { bad, readJson } from "../../../_util";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await readJson(req))) return bad("bad request");
  const { id } = await params;
  await db.update(games).set({ playCount: sql`${games.playCount} + 1` }).where(eq(games.id, id));
  return NextResponse.json({ ok: true });
}
