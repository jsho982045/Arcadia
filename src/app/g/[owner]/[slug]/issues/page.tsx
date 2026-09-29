import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { comments, issues, users } from "@/lib/db/schema";
import { loadGame } from "@/lib/game-context";
import { Empty, timeAgo } from "@/components/ui";

export default async function IssuesPage({ params, searchParams }: { params: Promise<{ owner: string; slug: string }>; searchParams: Promise<{ state?: string }> }) {
  const { owner: o, slug } = await params;
  const sp = await searchParams;
  const { game, base, viewer } = await loadGame(o, slug);
  const state = sp.state === "closed" ? "closed" : "open";
  const rows = await db
    .select({
      issue: issues,
      author: users,
      replies: sql<number>`(select count(*) from ${comments} where ${comments.targetType} = 'issue' and ${comments.targetId} = ${issues.id} and ${comments.kind} = 'comment')::int`,
    })
    .from(issues)
    .innerJoin(users, eq(users.id, issues.authorId))
    .where(and(eq(issues.gameId, game.id), eq(issues.status, state)))
    .orderBy(desc(issues.votes), desc(issues.createdAt));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 text-sm">
          {(["open", "closed"] as const).map((s) => (
            <Link key={s} href={`${base}/issues?state=${s}`} className={`rounded-lg px-3 py-1.5 capitalize ${state === s ? "bg-panel-2 text-ink" : "text-muted hover:text-ink"}`}>
              {s}
            </Link>
          ))}
        </div>
        <Link href={viewer ? `${base}/issues/new` : `/login?next=${encodeURIComponent(`${base}/issues/new`)}`} className="btn-primary">New issue</Link>
      </div>
      {rows.length ? (
        <ul className="card divide-y divide-line">
          {rows.map(({ issue, author, replies }) => (
            <li key={issue.id} className="flex items-center gap-4 px-4 py-3">
              <span className="flex w-12 flex-col items-center text-xs text-dim" title="Upvotes">
                <span className="text-base font-bold text-ink">{issue.votes}</span>▲
              </span>
              <div className="min-w-0 flex-1">
                <Link href={`${base}/issues/${issue.number}`} className="font-semibold hover:text-brand-2">{issue.title}</Link>
                <p className="text-xs text-dim">
                  <span className={`mr-2 rounded px-1.5 py-0.5 font-semibold ${issue.kind === "bug" ? "bg-bad/15 text-bad" : "bg-brand-2/15 text-brand-2"}`}>{issue.kind}</span>#{issue.number} opened {timeAgo(issue.createdAt)} by {author.username}
                </p>
              </div>
              {replies > 0 && <span className="text-sm text-dim">💬 {replies}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <Empty title={state === "open" ? "No open issues" : "No closed issues"}>Found a bug or have an idea? Open an issue so the creator and contributors can pick it up.</Empty>
      )}
    </div>
  );
}
