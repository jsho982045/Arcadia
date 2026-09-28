import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { saves } from "@/lib/db/schema";
import { getUser } from "@/lib/auth";
import { bad, readJson } from "../../../_util";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await readJson(req);
  const user = await getUser();
  if (!user) return bad("sign in to save", 401);
  if (!body || !("data" in body)) return bad("data required");
  const json = JSON.stringify(body.data);
  if (json.length > 256 * 1024) return bad("save too large (256 KB max)", 413);
  const { id } = await params;
  await db
    .insert(saves)
    .values({ gameId: id, userId: user.id, data: body.data as object, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [saves.gameId, saves.userId], set: { data: body.data as object, updatedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
