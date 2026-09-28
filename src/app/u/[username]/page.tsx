import { notFound } from "next/navigation";
import Link from "next/link";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { games, pullRequests, users } from "@/lib/db/schema";
import { getUser } from "@/lib/auth";
import { GameCard } from "@/components/GameCard";
import { Avatar, Empty, StatusPill, timeAgo } from "@/components/ui";

export default async function Profile({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const [user] = await db.select().from(users).where(eq(users.username, username.toLowerCase()));
  if (!user || user.banned) notFound();
  const viewer = await getUser();
  const self = viewer?.id === user.id;
  const statuses = self ? ["published", "review", "rejected", "archived"] : ["published"];
  const [mine, forks, prs] = await Promise.all([
    db.select().from(games).where(and(eq(games.ownerId, user.id), inArray(games.status, statuses))).orderBy(desc(games.updatedAt)),
    db.select().from(games).where(and(eq(games.ownerId, user.id), eq(games.status, "fork"))).orderBy(desc(games.updatedAt)),
    db
      .select({ pr: pullRequests, game: games, owner: users })
      .from(pullRequests)
      .innerJoin(games, eq(games.id, pullRequests.targetGameId))
      .innerJoin(users, eq(users.id, games.ownerId))
      .where(and(eq(pullRequests.authorId, user.id), or(eq(pullRequests.status, "merged"), eq(pullRequests.status, "open"))))
      .orderBy(desc(pullRequests.createdAt))
      .limit(30),
  ]);
  const merged = prs.filter((p) => p.pr.status === "merged").length;

  return (
    <div className="mt-10 space-y-10">
      <div className="flex flex-wrap items-center gap-5">
        <Avatar name={user.displayName} size={80} />
        <div>
          <h1 className="h-display text-3xl font-extrabold">
            {user.displayName} {user.plan === "pro" && <span className="chip align-middle border-brand/40 text-brand">PRO</span>}
          </h1>
          <p className="text-muted">@{user.username} · joined {timeAgo(user.createdAt)}</p>
          {user.bio && <p className="mt-2 max-w-xl text-sm">{user.bio}</p>}
          <p className="mt-2 text-sm text-dim">
            {mine.filter((g) => g.status === "published").length} games · {merged} contributions merged
          </p>
        </div>
      </div>

      <section>
        <h2 className="h-display mb-4 text-xl font-bold">Games</h2>
        {mine.length ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {mine.map((g) => (
              <GameCard key={g.id} game={g} owner={user} badge={g.status !== "published" ? g.status : undefined} />
            ))}
          </div>
        ) : (
          <Empty title="No games yet">{self && <Link href="/new" className="link">Publish your first game</Link>}</Empty>
        )}
      </section>

      <section>
        <h2 className="h-display mb-4 text-xl font-bold">Contributions</h2>
        {prs.length ? (
          <ul className="card divide-y divide-line">
            {prs.map(({ pr, game, owner }) => (
              <li key={pr.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <StatusPill status={pr.status} />
                <Link href={`/g/${owner.username}/${game.slug}/pulls/${pr.number}`} className="font-medium hover:underline">{pr.title}</Link>
                <span className="text-dim">
                  to {owner.username}/{game.slug} · {timeAgo(pr.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-dim">No pull requests yet.</p>
        )}
      </section>

      {forks.length > 0 && (
        <section>
          <h2 className="h-display mb-4 text-xl font-bold">Forks</h2>
          <ul className="flex flex-wrap gap-2">
            {forks.map((f) => (
              <li key={f.id}>
                <Link href={`/g/${user.username}/${f.slug}`} className="chip px-3 py-1 text-sm hover:text-ink">⑂ {f.slug}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
