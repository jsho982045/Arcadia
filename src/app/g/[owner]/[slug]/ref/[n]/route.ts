import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { pullRequests } from "@/lib/db/schema";
import { getGameByPath } from "@/lib/games";

/** "#12" links: go to pull request 12 if it exists, otherwise issue 12 (they share one counter). */
export async function GET(_req: Request, { params }: { params: Promise<{ owner: string; slug: string; n: string }> }) {
  const { owner, slug, n } = await params;
  const row = await getGameByPath(owner, slug);
  if (!row) redirect("/");
  const num = Number(n) | 0;
  const pr = await db.select({ id: pullRequests.id }).from(pullRequests).where(and(eq(pullRequests.targetGameId, row.game.id), eq(pullRequests.number, num))).limit(1);
  redirect(`/g/${owner}/${slug}/${pr.length ? "pulls" : "issues"}/${num}`);
}
