import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { comments, favorites, ratings, saves, scores, users } from "@/lib/db/schema";
import { loadGame } from "@/lib/game-context";
import { contributorsFor } from "@/lib/games";
import { remainingFreeSeconds, secondsPlayedToday } from "@/lib/play";
import { config, CATEGORIES, LICENSES } from "@/lib/config";
import { Player } from "@/components/Player";
import { Avatar, Prose, Rating, StatusPill, thumbUrl, timeAgo, UserLink } from "@/components/ui";
import { addComment, rateGame, report, toggleFavorite } from "@/app/actions/game";
import { SubmitButton } from "@/components/SubmitButton";

export default async function GamePage({ params, searchParams }: { params: Promise<{ owner: string; slug: string }>; searchParams: Promise<{ published?: string; reported?: string; error?: string }> }) {
  const { owner: o, slug } = await params;
  const sp = await searchParams;
  const { game, owner, viewer, version, base } = await loadGame(o, slug);
  const live = game.status === "published";

  const [board, gameComments, contributors, myRating, fav, save] = await Promise.all([
    db
      .select({ user: users, score: sql<number>`max(${scores.score})::int` })
      .from(scores)
      .innerJoin(users, eq(users.id, scores.userId))
      .where(eq(scores.gameId, game.id))
      .groupBy(users.id)
      .orderBy(desc(sql`max(${scores.score})`))
      .limit(10),
    db
      .select({ c: comments, author: users })
      .from(comments)
      .innerJoin(users, eq(users.id, comments.authorId))
      .where(and(eq(comments.targetType, "game"), eq(comments.targetId, game.id)))
      .orderBy(desc(comments.createdAt))
      .limit(50),
    contributorsFor(game.id),
    viewer ? db.select().from(ratings).where(and(eq(ratings.gameId, game.id), eq(ratings.userId, viewer.id))) : [],
    viewer ? db.select().from(favorites).where(and(eq(favorites.gameId, game.id), eq(favorites.userId, viewer.id))) : [],
    viewer ? db.select().from(saves).where(and(eq(saves.gameId, game.id), eq(saves.userId, viewer.id))) : [],
  ]);

  // Play-time allowance (anonymous players are tracked by cookie on their first heartbeat).
  let remaining: number | null = null;
  const isPro = viewer?.plan === "pro";
  if (live && !isPro) {
    if (viewer) remaining = await remainingFreeSeconds(viewer.id, false);
    else {
      const { cookies } = await import("next/headers");
      const anon = (await cookies()).get("arcadia_anon")?.value;
      remaining = anon ? Math.max(0, config.freeDailySeconds - (await secondsPlayedToday(`anon:${anon}`))) : config.freeDailySeconds;
    }
  }
  const lic = LICENSES[game.license];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_310px]">
      <div className="min-w-0 space-y-6">
        {sp.published && (
          <div className="rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">
            {game.status === "review" ? "Uploaded! Your game is in the review queue. You can play it here while you wait; it will appear on the site once approved." : "Your game is live!"}
          </div>
        )}
        {sp.error && <div className="rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">{sp.error}</div>}
        {sp.reported && <div className="rounded-xl border border-line bg-panel px-4 py-3 text-sm text-muted">Thanks, our moderators will take a look.</div>}
        {game.status === "rejected" && game.reviewNote && (
          <div className="rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">Not approved: {game.reviewNote}</div>
        )}

        {version && live && !isPro && !game.freeToPlay && game.ownerId !== viewer?.id ? (
          <div className="box"><h2 className="box-title box-title-orange">Locked</h2><div className="flex flex-col items-center gap-3 bg-gradient-to-b from-white to-[#eaf3fc] p-10 text-center">
            <p className="retro-title-dark text-2xl">This game is for subscribers</p>
            <p className="max-w-md text-muted">
              Start a {config.trialDays}-day free trial to play every game, from ${config.proMonthlyCents / 100}/month. Half of it goes to the creators you play.
            </p>
            <Link href={viewer ? "/pro" : `/signup?next=${encodeURIComponent(`/g/${owner.username}/${game.slug}`)}`} className="btn-primary">Start free trial</Link>
            <p className="text-xs text-dim">Or try one of the free games on the home page.</p>
          </div></div>
        ) : version ? (
          <Player
            gameId={game.id}
            versionId={version.id}
            playOrigin={config.playOrigin}
            title={game.title}
            orientation={game.orientation}
            thumb={thumbUrl(game)}
            mode={live ? "live" : "preview"}
            signedIn={!!viewer}
            isPro={isPro}
            initialSave={save[0]?.data}
            remainingSeconds={remaining}
          />
        ) : (
          <p className="text-muted">This game has no playable version yet.</p>
        )}

        <section className="box">
          <h2 className="box-title">About this game</h2>
          <div className="p-5">
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
            <Rating sum={game.ratingSum} count={game.ratingCount} />
            <span>· {game.playCount.toLocaleString()} plays</span>
            <span className="chip">{CATEGORIES.find((c) => c.id === game.category)?.label ?? game.category}</span>
            {version && <span>· v{version.number}, updated {timeAgo(version.createdAt)}</span>}
            {game.status !== "published" && <StatusPill status={game.status} />}
          </div>
          {game.description && <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed">{game.description}</p>}
          {game.instructions && (
            <p className="bevel-inset mt-4 rounded-xl px-4 py-3 text-sm">
              <b>How to play:</b> {game.instructions}
            </p>
          )}
          {game.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {game.tags.map((t) => (
                <Link key={t} href={`/browse?q=${encodeURIComponent(t)}`} className="chip hover:text-ink">#{t}</Link>
              ))}
            </div>
          )}
          {viewer && live && (
            <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-line pt-5">
              <form action={rateGame} className="flex items-center gap-1">
                <input type="hidden" name="gameId" value={game.id} />
                <span className="mr-1 text-sm text-muted">Your rating</span>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} name="stars" value={n} className={`text-2xl leading-none transition hover:scale-125 ${myRating[0] && myRating[0].stars >= n ? "text-warn" : "text-dim"}`} aria-label={`${n} stars`}>
                    ★
                  </button>
                ))}
              </form>
              <form action={toggleFavorite}>
                <input type="hidden" name="gameId" value={game.id} />
                <button className="btn-ghost">{fav.length ? "♥ Favourited" : "♡ Favourite"}</button>
              </form>
              <Link href={`${base}/issues/new`} className="btn-ghost">Report a bug / suggest an idea</Link>
            </div>
          )}
          </div>
        </section>

        <section>
          <h2 className="section-head mb-3">Comments</h2>
          {viewer ? (
            <form action={addComment} className="card mb-4 space-y-3 p-4">
              <input type="hidden" name="targetType" value="game" />
              <input type="hidden" name="targetId" value={game.id} />
              <input type="hidden" name="back" value={base} />
              <textarea name="body" required maxLength={5000} rows={3} className="input" placeholder="Say something nice, or constructive." />
              <div className="flex justify-end">
                <SubmitButton pendingText="Posting…">Post comment</SubmitButton>
              </div>
            </form>
          ) : (
            <p className="card mb-4 px-4 py-3 text-sm text-muted">
              <Link href={`/login?next=${encodeURIComponent(base)}`} className="link">Sign in</Link> to comment.
            </p>
          )}
          <ul className="space-y-3">
            {gameComments.map(({ c, author }) => (
              <li key={c.id} className="card flex gap-3 p-4">
                <Avatar name={author.displayName} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <UserLink user={author} avatar={false} /> <span className="text-dim">· {timeAgo(c.createdAt)}</span>
                  </p>
                  <Prose text={c.body} />
                </div>
              </li>
            ))}
            {!gameComments.length && <li className="card px-4 py-3 text-sm text-dim">No comments yet.</li>}
          </ul>
        </section>
      </div>

      <aside className="space-y-6">
        <section className="box">
          <h3 className="box-title box-title-orange">Leaderboard</h3>
          <div className="p-4">
          {board.length ? (
            <ol className="space-y-2 text-sm">
              {board.map((r, i) => (
                <li key={r.user.id} className="flex items-center gap-2">
                  <span className={`w-6 text-center font-bold ${i === 0 ? "text-warn" : "text-dim"}`}>{i + 1}</span>
                  <UserLink user={r.user} />
                  <span className="ml-auto font-mono font-semibold">{Number(r.score).toLocaleString()}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-dim">No scores yet. Be the first!</p>
          )}
          </div>
        </section>

        <section className="box">
          <h3 className="box-title">Made by</h3>
          <div className="p-4">
          <div className="flex items-center gap-3">
            <Avatar name={owner.displayName} size={40} />
            <div>
              <p className="font-semibold">{owner.displayName}</p>
              <UserLink user={owner} avatar={false} />
            </div>
          </div>
          {contributors.length > 0 && (
            <>
              <h4 className="mb-2 mt-5 text-sm font-semibold text-muted">Contributors</h4>
              <ul className="space-y-1.5 text-sm">
                {contributors.map((c) => (
                  <li key={c.user.id} className="flex items-center justify-between">
                    <UserLink user={c.user} />
                    <span className="text-xs text-dim">{c.merged} merged · {c.points} pts</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-dim">Contributors share {game.contributorShare}% of this game&apos;s earnings, split by points.</p>
            </>
          )}
          </div>
        </section>

        <section className="box text-sm">
          <h3 className="box-title">Open source on {config.appName}</h3>
          <div className="p-4">
          <p className="text-muted">
            <b className="text-ink">{lic?.label}</b>. {lic?.summary}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`${base}/code`} className="btn-ghost">View code</Link>
            <Link href={`${base}/pulls`} className="btn-ghost">Pull requests</Link>
          </div>
          </div>
        </section>

        {viewer && viewer.id !== game.ownerId && (
          <details className="card p-3 text-sm text-dim">
            <summary className="cursor-pointer font-semibold hover:text-muted">Report this game</summary>
            <form action={report} className="mt-2 space-y-2">
              <input type="hidden" name="targetType" value="game" />
              <input type="hidden" name="targetId" value={game.id} />
              <input type="hidden" name="back" value={base} />
              <textarea name="reason" required className="input" rows={2} placeholder="What's wrong? (copyright, offensive, broken, malicious…)" />
              <button className="btn-danger">Send report</button>
            </form>
          </details>
        )}
      </aside>
    </div>
  );
}
