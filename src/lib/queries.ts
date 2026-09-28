import { and, desc, eq, gte, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "./db";
import { games, pullRequests, users } from "./db/schema";

export async function listGames(opts: { q?: string; category?: string; sort?: "popular" | "new" | "top"; limit?: number; ownerId?: string } = {}) {
  const where: SQL[] = [eq(games.status, "published")];
  if (opts.category) where.push(eq(games.category, opts.category));
  if (opts.ownerId) where.push(eq(games.ownerId, opts.ownerId));
  if (opts.q) {
    const q = `%${opts.q.replace(/[%_]/g, "")}%`;
    where.push(or(ilike(games.title, q), ilike(games.description, q), ilike(users.username, q), sql`${games.tags}::text ilike ${q}`)!);
  }
  const order =
    opts.sort === "new"
      ? [desc(games.publishedAt)]
      : opts.sort === "top"
        ? [desc(sql`(${games.ratingSum} + 3.5 * 5) / (${games.ratingCount} + 5.0)`)] // Bayesian average, so 1 rating of 5★ doesn't win
        : [desc(games.playCount), desc(games.publishedAt)];
  return db
    .select({ game: games, owner: users })
    .from(games)
    .innerJoin(users, eq(users.id, games.ownerId))
    .where(and(...where))
    .orderBy(...order)
    .limit(opts.limit ?? 48);
}

/** Games with the most merged pull requests recently: the "getting better" shelf. */
export async function mostImproved(days = 30, limit = 6) {
  const since = new Date(Date.now() - days * 86400_000);
  return db
    .select({ game: games, owner: users, merged: sql<number>`count(${pullRequests.id})::int` })
    .from(pullRequests)
    .innerJoin(games, eq(games.id, pullRequests.targetGameId))
    .innerJoin(users, eq(users.id, games.ownerId))
    .where(and(eq(pullRequests.status, "merged"), gte(pullRequests.closedAt, since), eq(games.status, "published")))
    .groupBy(games.id, users.id)
    .orderBy(desc(sql`count(${pullRequests.id})`))
    .limit(limit);
}

export async function openPrCount(gameId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(pullRequests).where(and(eq(pullRequests.targetGameId, gameId), eq(pullRequests.status, "open")));
  return Number(r?.n ?? 0);
}
