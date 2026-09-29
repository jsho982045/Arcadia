import Link from "next/link";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { games, pullRequests, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { computeCreatorPool, gameMinutes, monthRange } from "@/lib/play";
import { config } from "@/lib/config";
import { Empty, StatusPill, timeAgo } from "@/components/ui";

export const metadata = { title: "Creator dashboard" };

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default async function Dashboard() {
  const user = await requireUser("/dashboard");
  const { month } = monthRange();
  const mine = await db.select().from(games).where(and(eq(games.ownerId, user.id), ne(games.status, "fork"))).orderBy(desc(games.updatedAt));
  const ids = mine.map((g) => g.id);
  const [minutes, pool, incoming] = await Promise.all([
    gameMinutes(ids),
    computeCreatorPool(),
    ids.length
      ? db
          .select({ pr: pullRequests, author: users, game: games })
          .from(pullRequests)
          .innerJoin(users, eq(users.id, pullRequests.authorId))
          .innerJoin(games, eq(games.id, pullRequests.targetGameId))
          .where(and(inArray(pullRequests.targetGameId, ids), eq(pullRequests.status, "open")))
          .orderBy(desc(pullRequests.createdAt))
      : Promise.resolve([]),
  ]);
  const myEarnings = pool.earnings.get(user.id) ?? 0;
  const totalMinutes = [...minutes.values()].reduce((a, b) => a + b.seconds, 0) / 60;

  return (
    <div className="space-y-8">
      <div className="card px-5 py-4">
        <h1 className="retro-title-dark text-3xl">Creator dashboard</h1>
        <p className="text-muted">This month ({month}). Earnings are estimates until the month closes and payouts run.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Active play this month" value={`${Math.round(totalMinutes).toLocaleString()} min`} />
        <Stat label="Estimated earnings" value={money(myEarnings)} hint="Your share of the creator pool, including contributor earnings" />
        <Stat label="Creator pool this month" value={money(pool.poolCents)} hint={`${pool.subscribers} active Pro subscribers × ${money(pool.perSubscriberCents)} on average`} />
      </div>

      <section>
        <h2 className="section-head mb-3">Pull requests waiting for you</h2>
        {incoming.length ? (
          <ul className="card divide-y divide-line">
            {incoming.map(({ pr, author, game }) => (
              <li key={pr.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <Link href={`/g/${user.username}/${game.slug}/pulls/${pr.number}`} className="font-semibold hover:underline">{pr.title}</Link>
                <span className="text-dim">on {game.title} · by {author.username} · {timeAgo(pr.createdAt)}</span>
                <Link href={`/g/${user.username}/${game.slug}/pulls/${pr.number}?tab=preview`} className="btn-ghost ml-auto px-3 py-1 text-xs">▶ Play preview</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-dim">Nothing to review.</p>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="h-display text-xl font-bold">Your games</h2>
          <Link href="/new" className="btn-primary">Publish a game</Link>
        </div>
        {mine.length ? (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-dim">
                <tr>
                  <th className="px-4 py-3">Game</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Plays (all time)</th>
                  <th className="px-4 py-3 text-right">Players this month</th>
                  <th className="px-4 py-3 text-right">Minutes this month</th>
                  <th className="px-4 py-3 text-right">Est. earnings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {mine.map((g) => {
                  const m = minutes.get(g.id);
                  return (
                    <tr key={g.id}>
                      <td className="px-4 py-3"><Link href={`/g/${user.username}/${g.slug}`} className="font-semibold hover:underline">{g.title}</Link></td>
                      <td className="px-4 py-3"><StatusPill status={g.status} /></td>
                      <td className="px-4 py-3 text-right">{g.playCount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">{(m?.players ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">{Math.round((m?.seconds ?? 0) / 60).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">{money(pool.gameCents.get(g.id) ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="You haven't published a game yet">
            <Link href="/new" className="link">Upload one</Link>, or fork an existing game and start contributing.
          </Empty>
        )}
        <p className="mt-3 text-xs text-dim">
          How earnings work: {Math.round(config.creatorPoolShare * 100)}% of net Pro revenue goes into the pool. Each subscriber&apos;s share is split across the games they played, by active minutes. Game earnings shown are before the contributor share.
          Payouts need a connected payout account (coming soon) and are paid monthly above $25.
        </p>
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="box">
      <p className="box-title !text-sm">{label}</p>
      <div className="p-4">
        <p className="retro-title-dark text-3xl">{value}</p>
        {hint && <p className="mt-1 text-xs text-dim">{hint}</p>}
      </div>
    </div>
  );
}
