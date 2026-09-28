import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { games, pullRequests, users } from "@/lib/db/schema";
import { loadGame } from "@/lib/game-context";
import { getVersion, previewMerge, prVersions } from "@/lib/games";
import { changedFiles } from "@/lib/trees";
import { config } from "@/lib/config";
import { Avatar, Checks, ErrorNote, Prose, StatusPill, timeAgo, UserLink } from "@/components/ui";
import { Thread } from "@/components/Thread";
import { Diff } from "@/components/Diff";
import { Player } from "@/components/Player";
import { mergePrAction, setPrStatus } from "@/app/actions/game";
import { SubmitButton } from "@/components/SubmitButton";

export default async function PullPage({ params, searchParams }: { params: Promise<{ owner: string; slug: string; n: string }>; searchParams: Promise<{ tab?: string; error?: string }> }) {
  const { owner: o, slug, n } = await params;
  const sp = await searchParams;
  const { game, base, viewer, canMaintain } = await loadGame(o, slug);
  const [row] = await db
    .select({ pr: pullRequests, author: users })
    .from(pullRequests)
    .innerJoin(users, eq(users.id, pullRequests.authorId))
    .where(and(eq(pullRequests.targetGameId, game.id), eq(pullRequests.number, Number(n) | 0)));
  if (!row) notFound();
  const { pr, author } = row;
  const { head, base: baseV } = await prVersions(pr);
  const [fork] = await db.select({ game: games, owner: users }).from(games).innerJoin(users, eq(users.id, games.ownerId)).where(eq(games.id, pr.sourceGameId));
  const live = await getVersion(game.currentVersionId);
  const merge = pr.status === "open" ? await previewMerge(pr) : null;
  const mergedV = pr.mergedVersionId ? await getVersion(pr.mergedVersionId) : null;
  const tab = sp.tab === "files" ? "files" : sp.tab === "preview" ? "preview" : "conversation";
  const files = head && baseV ? changedFiles(baseV.tree, head.tree) : [];
  const url = `${base}/pulls/${pr.number}`;
  const isAuthor = viewer?.id === pr.authorId;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="h-display text-2xl font-bold">
          {pr.title} <span className="font-normal text-dim">#{pr.number}</span>
        </h2>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
          <StatusPill status={pr.status} />
          <UserLink user={author} /> wants to merge changes from{" "}
          {fork ? (
            <Link href={`/g/${fork.owner.username}/${fork.game.slug}`} className="rounded bg-panel-2 px-1.5 font-mono text-xs text-ink hover:underline">
              {fork.owner.username}/{fork.game.slug}
            </Link>
          ) : (
            "a deleted fork"
          )}{" "}
          · {timeAgo(pr.createdAt)}
        </p>
      </div>
      <ErrorNote message={sp.error} />

      <nav className="flex gap-1 border-b border-line text-sm">
        {[
          ["conversation", "Conversation"],
          ["preview", "▶ Play preview"],
          ["files", `Files changed ${files.length}`],
        ].map(([k, label]) => (
          <Link key={k} href={`${url}${k === "conversation" ? "" : `?tab=${k}`}`} className={`-mb-px border-b-2 px-4 py-2.5 font-medium ${tab === k ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"}`}>
            {label}
          </Link>
        ))}
      </nav>

      {tab === "files" && head && baseV && <Diff base={baseV.tree} head={head.tree} baseVersionId={baseV.id} headVersionId={head.id} />}

      {tab === "preview" && head && (
        <div className="grid gap-6 xl:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-semibold text-muted">Live version {live ? `(v${live.number})` : ""}</p>
            {live && <Player gameId={game.id} versionId={live.id} playOrigin={config.playOrigin} title={game.title} orientation={game.orientation} mode="preview" heightClass="h-[60vh]" />}
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-brand">With this pull request</p>
            <Player gameId={game.id} versionId={head.id} playOrigin={config.playOrigin} title={game.title} orientation={game.orientation} mode="preview" heightClass="h-[60vh]" />
          </div>
        </div>
      )}

      {tab === "conversation" && (
        <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0 space-y-6">
            <div className="flex gap-3">
              <Avatar name={author.displayName} size={36} />
              <div className="card min-w-0 flex-1 px-4 py-3">{pr.body ? <Prose text={pr.body} base={base} /> : <p className="text-sm text-dim">No description.</p>}</div>
            </div>
            <Thread targetType="pr" targetId={pr.id} back={url} viewer={viewer} refBase={base} />

            {pr.status === "open" && merge && (
              <div className="card space-y-4 p-5">
                {merge.ok ? (
                  <p className="font-semibold text-ok">✓ No conflicts. This can be merged.</p>
                ) : merge.conflicts.length ? (
                  <div>
                    <p className="font-semibold text-warn">Conflicts in {merge.conflicts.length} file(s)</p>
                    <p className="mt-1 text-sm text-muted">
                      The game changed since this fork was made, and both sides edited: <code className="text-ink">{merge.conflicts.join(", ")}</code>.{" "}
                      {isAuthor ? "Click Sync on your fork to bring it up to date (your version of those files is kept), then check the diff." : "The author needs to sync their fork."}
                    </p>
                  </div>
                ) : (
                  <p className="font-semibold text-bad">{merge.reason}</p>
                )}
                {canMaintain && merge.ok && (
                  <form action={mergePrAction} className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
                    <input type="hidden" name="prId" value={pr.id} />
                    <label className="text-sm text-muted">
                      Contributor points{" "}
                      <select name="points" defaultValue="1" className="input ml-1 inline-block w-auto py-1">
                        <option value="1">1 · small fix</option>
                        <option value="3">3 · solid improvement</option>
                        <option value="5">5 · major feature</option>
                      </select>
                    </label>
                    <SubmitButton className="btn-ok" pendingText="Merging…">Merge &amp; release</SubmitButton>
                    <p className="w-full text-xs text-dim">Merging creates a new live version immediately. You can roll back from Releases at any time.</p>
                  </form>
                )}
                {(canMaintain || isAuthor) && (
                  <form action={setPrStatus}>
                    <input type="hidden" name="prId" value={pr.id} />
                    <input type="hidden" name="status" value="closed" />
                    <button className="btn-danger">Close without merging</button>
                  </form>
                )}
              </div>
            )}
            {pr.status === "closed" && (canMaintain || isAuthor) && (
              <form action={setPrStatus}>
                <input type="hidden" name="prId" value={pr.id} />
                <input type="hidden" name="status" value="open" />
                <button className="btn-ghost">Reopen</button>
              </form>
            )}
            {pr.status === "merged" && mergedV && (
              <p className="card px-5 py-4 text-sm text-muted">
                Merged as <b className="text-ink">v{mergedV.number}</b>. {author.username} earned {pr.points} contributor point{pr.points === 1 ? "" : "s"} on this game.
              </p>
            )}
          </div>
          <aside className="space-y-4">
            <div className="card p-4">
              <p className="mb-2 text-sm font-semibold">Automatic checks</p>
              {head ? <Checks report={head.checks} /> : <p className="text-sm text-dim">Unavailable</p>}
            </div>
            <div className="card p-4 text-sm text-muted">
              <p className="mb-1 font-semibold text-ink">Reviewing tips</p>
              Play the preview side by side with the live game, read the changed files, and ask questions in the conversation before merging.
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
