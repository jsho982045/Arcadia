import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pullRequests, users } from "@/lib/db/schema";
import { loadGame } from "@/lib/game-context";
import { Empty, StatusPill, timeAgo } from "@/components/ui";
import { isForkable } from "@/lib/games";

export default async function PullsPage({ params, searchParams }: { params: Promise<{ owner: string; slug: string }>; searchParams: Promise<{ state?: string }> }) {
  const { owner: o, slug } = await params;
  const sp = await searchParams;
  const { game, base, isOwner } = await loadGame(o, slug);
  const state = sp.state === "merged" ? "merged" : sp.state === "closed" ? "closed" : "open";
  const rows = await db
    .select({ pr: pullRequests, author: users })
    .from(pullRequests)
    .innerJoin(users, eq(users.id, pullRequests.authorId))
    .where(and(eq(pullRequests.targetGameId, game.id), eq(pullRequests.status, state)))
    .orderBy(desc(pullRequests.createdAt));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 text-sm">
          {(["open", "merged", "closed"] as const).map((s) => (
            <Link key={s} href={`${base}/pulls?state=${s}`} className={`rounded-lg px-3 py-1.5 capitalize ${state === s ? "bg-panel-2 text-ink" : "text-muted hover:text-ink"}`}>
              {s}
            </Link>
          ))}
        </div>
        {!isOwner && isForkable(game) && <p className="text-sm text-muted">To suggest a change: <b className="text-ink">Fork &amp; improve</b> → edit → open a pull request.</p>}
      </div>
      {rows.length ? (
        <ul className="card divide-y divide-line">
          {rows.map(({ pr, author }) => (
            <li key={pr.id} className="flex items-center gap-4 px-4 py-3">
              <StatusPill status={pr.status} />
              <div className="min-w-0 flex-1">
                <Link href={`${base}/pulls/${pr.number}`} className="font-semibold hover:text-brand-2">{pr.title}</Link>
                <p className="text-xs text-dim">
                  #{pr.number} by {author.username} · opened {timeAgo(pr.createdAt)}
                  {pr.status === "merged" && pr.closedAt ? ` · merged ${timeAgo(pr.closedAt)}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title={`No ${state} pull requests`}>
          {game.allowPrs ? "Pull requests are suggested changes from other players. The owner can play each one before merging it." : "The owner has turned off pull requests for this game."}
        </Empty>
      )}
    </div>
  );
}
