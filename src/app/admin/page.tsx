import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { games, reports, users, versions } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";
import { approveGame, banUser, rejectGame, resolveReport } from "@/app/actions/admin";
import { Checks, Empty, timeAgo } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Moderation" };

export default async function Admin() {
  await requireAdmin();
  const [queue, open] = await Promise.all([
    db
      .select({ game: games, owner: users, version: versions })
      .from(games)
      .innerJoin(users, eq(users.id, games.ownerId))
      .innerJoin(versions, eq(versions.id, games.currentVersionId))
      .where(eq(games.status, "review"))
      .orderBy(asc(games.createdAt)),
    db.select({ r: reports, reporter: users }).from(reports).innerJoin(users, eq(users.id, reports.reporterId)).where(eq(reports.status, "open")).orderBy(desc(reports.createdAt)),
  ]);
  return (
    <div className="space-y-8">
      <h1 className="retro-title text-4xl">Moderation</h1>
      <section>
        <h2 className="section-head mb-3">Review queue ({queue.length})</h2>
        {queue.length ? (
          <div className="space-y-4">
            {queue.map(({ game, owner, version }) => (
              <div key={game.id} className="card grid gap-4 p-5 md:grid-cols-[1fr_320px]">
                <div>
                  <Link href={`/g/${owner.username}/${game.slug}`} className="h-display text-lg font-bold hover:underline">{game.title}</Link>
                  <p className="text-sm text-dim">by {owner.username} · submitted {timeAgo(game.createdAt)} · {Object.keys(version.tree).length} files</p>
                  <p className="mt-2 text-sm text-muted">{game.description || "No description."}</p>
                  <div className="mt-3">
                    <Checks report={version.checks} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Link href={`/g/${owner.username}/${game.slug}`} className="btn-ghost w-full">▶ Play it</Link>
                  <Link href={`/g/${owner.username}/${game.slug}/code`} className="btn-ghost w-full">Read the code</Link>
                  <form action={approveGame}>
                    <input type="hidden" name="gameId" value={game.id} />
                    <SubmitButton className="btn-ok w-full">Approve &amp; publish</SubmitButton>
                  </form>
                  <form action={rejectGame} className="space-y-2">
                    <input type="hidden" name="gameId" value={game.id} />
                    <input name="note" className="input" placeholder="Reason (shown to the creator)" required />
                    <button className="btn-danger w-full">Reject</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Queue is empty" />
        )}
      </section>
      <section>
        <h2 className="section-head mb-3">Reports ({open.length})</h2>
        {open.length ? (
          <ul className="card divide-y divide-line">
            {open.map(({ r, reporter }) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="chip">{r.targetType}</span>
                <span className="flex-1">{r.reason}</span>
                <span className="text-dim">by {reporter.username} · {timeAgo(r.createdAt)}</span>
                {r.targetType === "game" && <Link href={`/admin/goto/${r.targetId}`} className="link">View</Link>}
                <form action={resolveReport}>
                  <input type="hidden" name="reportId" value={r.id} />
                  <button className="btn-ghost px-3 py-1 text-xs">Resolve</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-dim">No open reports.</p>
        )}
      </section>
      <section>
        <h2 className="section-head mb-3">Suspend a user</h2>
        <form action={banUser} className="flex max-w-md gap-2">
          <input name="username" className="input" placeholder="username" required />
          <button className="btn-danger">Suspend</button>
        </form>
      </section>
    </div>
  );
}
