import JSZip from "jszip";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { games } from "@/lib/db/schema";
import { getVersion } from "@/lib/games";
import { getBlob } from "@/lib/storage";
import { getUser } from "@/lib/auth";
import { canPlay } from "@/lib/games";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await getVersion(id);
  if (!v) return new Response("Not found", { status: 404 });
  const [game] = await db.select().from(games).where(eq(games.id, v.gameId));
  if (!game || !canPlay(game, await getUser())) return new Response("Not found", { status: 404 });
  const zip = new JSZip();
  for (const [p, f] of Object.entries(v.tree)) zip.file(p, await getBlob(f.h));
  const buf = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return new Response(buf as unknown as BodyInit, {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${game.slug}-v${v.number}.zip"` },
  });
}
