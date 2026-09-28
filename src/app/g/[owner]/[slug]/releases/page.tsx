import Link from "next/link";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { pullRequests } from "@/lib/db/schema";
import { loadGame } from "@/lib/game-context";
import { recentVersions } from "@/lib/games";
import { treeSize } from "@/lib/trees";
import { ErrorNote, timeAgo, UserLink } from "@/components/ui";
import { revertAction, uploadVersion } from "@/app/actions/game";
import { SubmitButton } from "@/components/SubmitButton";

export default async function ReleasesPage({ params, searchParams }: { params: Promise<{ owner: string; slug: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { owner: o, slug } = await params;
  const sp = await searchParams;
  const { game, base, canMaintain, isOwner } = await loadGame(o, slug);
  const rows = await recentVersions(game.id, 100);
  const prIds = rows.map((r) => r.v.prId).filter(Boolean) as string[];
  const prs = prIds.length ? await db.select({ id: pullRequests.id, number: pullRequests.number }).from(pullRequests).where(inArray(pullRequests.id, prIds)) : [];
  const prNum = new Map(prs.map((p) => [p.id, p.number]));
  const isFork = game.status === "fork";

  return (
    <div className="space-y-6">
      <ErrorNote message={sp.error} />
      {sp.notice && <p className="rounded-xl border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ok">{sp.notice}</p>}
      {isOwner && !isFork && (
        <details className="card p-5">
          <summary className="cursor-pointer font-semibold">Upload a new version (.zip)</summary>
          <form action={uploadVersion} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <input type="hidden" name="gameId" value={game.id} />
            <input type="file" name="zip" accept=".zip,application/zip" required className="input" />
            <input name="message" className="input" placeholder="What changed?" maxLength={300} />
            <SubmitButton pendingText="Uploading…">Release</SubmitButton>
          </form>
        </details>
      )}
      <ol className="relative space-y-3 border-l border-line pl-6">
        {rows.map(({ v, author }) => {
          const current = v.id === game.currentVersionId;
          return (
            <li key={v.id} className="card relative p-4">
              <span className={`absolute -left-[31px] top-5 h-3 w-3 rounded-full ${current ? "bg-brand" : "bg-line"}`} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">
                    <span className="mr-2 font-mono text-brand-2">v{v.number}</span>
                    {v.message}
                    {current && <span className="chip ml-2 border-brand/40 text-brand">{isFork ? "latest" : "live"}</span>}
                    {v.checks.status === "fail" && <span className="chip ml-2 border-bad/40 text-bad">failed checks</span>}
                  </p>
                  <p className="mt-1 text-xs text-dim">
                    <UserLink user={author} /> · {timeAgo(v.createdAt)} · {Object.keys(v.tree).length} files · {(treeSize(v.tree) / 1024).toFixed(0)} KB
                    {v.prId && prNum.has(v.prId) && (
                      <>
                        {" "}· from <Link href={`${base}/pulls/${prNum.get(v.prId)}`} className="link">pull request #{prNum.get(v.prId)}</Link>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  <a href={`/api/versions/${v.id}/zip`} className="btn-ghost px-3 py-1.5 text-xs">⬇ zip</a>
                  {canMaintain && !current && !isFork && v.checks.status !== "fail" && (
                    <form action={revertAction}>
                      <input type="hidden" name="gameId" value={game.id} />
                      <input type="hidden" name="versionId" value={v.id} />
                      <button className="btn-ghost px-3 py-1.5 text-xs">↺ Roll back to this</button>
                    </form>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
