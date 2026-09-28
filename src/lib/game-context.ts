import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { games, users } from "./db/schema";
import { getUser } from "./auth";
import { canPlay, getGameByPath, getVersion } from "./games";

/** Everything a /g/[owner]/[slug]/* page needs. Cached per request so layout + page share it. */
export const loadGame = cache(async (ownerName: string, slug: string) => {
  const row = await getGameByPath(decodeURIComponent(ownerName), decodeURIComponent(slug));
  if (!row) notFound();
  const viewer = await getUser();
  const { game, owner } = row;
  if (!canPlay(game, viewer) && game.status !== "rejected") notFound();
  if (game.status === "rejected" && !(viewer && (viewer.id === game.ownerId || viewer.isAdmin))) notFound();
  const version = await getVersion(game.currentVersionId);
  let parent: { game: typeof games.$inferSelect; owner: typeof users.$inferSelect } | null = null;
  if (game.forkOfId) {
    const r = await db.select({ game: games, owner: users }).from(games).innerJoin(users, eq(users.id, games.ownerId)).where(eq(games.id, game.forkOfId));
    parent = r[0] ?? null;
  }
  const isOwner = !!viewer && viewer.id === game.ownerId;
  const canMaintain = isOwner || !!viewer?.isAdmin;
  const base = `/g/${owner.username}/${game.slug}`;
  return { game, owner, viewer, version, parent, isOwner, canMaintain, base };
});
