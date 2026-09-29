import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { issueVotes, issues, pullRequests, users } from "@/lib/db/schema";
import { loadGame } from "@/lib/game-context";
import { Avatar, Prose, StatusPill, timeAgo, UserLink } from "@/components/ui";
import { Thread } from "@/components/Thread";
import { setIssueStatus, voteIssue } from "@/app/actions/game";
import Link from "next/link";

export default async function IssuePage({ params }: { params: Promise<{ owner: string; slug: string; n: string }> }) {
  const { owner: o, slug, n } = await params;
  const { game, base, viewer, isOwner } = await loadGame(o, slug);
  const [row] = await db
    .select({ issue: issues, author: users })
    .from(issues)
    .innerJoin(users, eq(users.id, issues.authorId))
    .where(and(eq(issues.gameId, game.id), eq(issues.number, Number(n) | 0)));
  if (!row) notFound();
  const { issue, author } = row;
  const voted = viewer ? (await db.select().from(issueVotes).where(and(eq(issueVotes.issueId, issue.id), eq(issueVotes.userId, viewer.id)))).length > 0 : false;
  const closedBy = issue.closedByPrId ? (await db.select().from(pullRequests).where(eq(pullRequests.id, issue.closedByPrId)))[0] : null;
  const back = `${base}/issues/${issue.number}`;
  const canClose = viewer && (isOwner || viewer.id === issue.authorId || viewer.isAdmin);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_260px]">
      <div className="min-w-0 space-y-6">
        <div>
          <h2 className="h-display text-2xl font-bold">
            {issue.title} <span className="font-normal text-dim">#{issue.number}</span>
          </h2>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <StatusPill status={issue.status} />
            <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${issue.kind === "bug" ? "bg-bad/15 text-bad" : "bg-brand-2/15 text-brand-2"}`}>{issue.kind}</span>
            <UserLink user={author} /> opened this {timeAgo(issue.createdAt)}
          </p>
          {closedBy && (
            <p className="mt-2 text-sm text-muted">
              Fixed by <Link href={`${base}/pulls/${closedBy.number}`} className="link">pull request #{closedBy.number}</Link>
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <Avatar name={author.displayName} size={36} />
          <div className="card min-w-0 flex-1 px-4 py-3">{issue.body ? <Prose text={issue.body} base={base} /> : <p className="text-sm text-dim">No description.</p>}</div>
        </div>
        <Thread targetType="issue" targetId={issue.id} back={back} viewer={viewer} refBase={base} />
      </div>
      <aside className="space-y-4">
        <form action={voteIssue} className="card p-4">
          <input type="hidden" name="issueId" value={issue.id} />
          <input type="hidden" name="back" value={back} />
          <p className="text-sm text-muted">{issue.votes} player{issue.votes === 1 ? "" : "s"} want this</p>
          {viewer && <button className={`${voted ? "btn-primary" : "btn-ghost"} mt-2 w-full`}>{voted ? "▲ Upvoted" : "▲ Upvote"}</button>}
        </form>
        {canClose && (
          <form action={setIssueStatus}>
            <input type="hidden" name="issueId" value={issue.id} />
            <input type="hidden" name="status" value={issue.status === "open" ? "closed" : "open"} />
            <button className="btn-ghost w-full">{issue.status === "open" ? "Close issue" : "Reopen issue"}</button>
          </form>
        )}
        {viewer && !isOwner && game.allowPrs && issue.status === "open" && (
          <p className="card p-4 text-sm text-muted">
            Want to fix this yourself? Fork the game, make the change, and open a pull request with <code className="text-ink">Fixes #{issue.number}</code> in the description. It closes this issue automatically when merged.
          </p>
        )}
      </aside>
    </div>
  );
}
