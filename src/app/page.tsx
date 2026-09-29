import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { games, pullRequests, users } from "@/lib/db/schema";
import { listGames, mostImproved } from "@/lib/queries";
import { GameCard, compact } from "@/components/GameCard";
import { CategoryNav } from "@/components/CategoryNav";
import type { Game } from "@/lib/db/schema";
import { CATEGORIES } from "@/lib/config";
import { getUser } from "@/lib/auth";
import { Stars, thumbUrl } from "@/components/ui";

export default async function Home() {
  const [popular, top, fresh, improved, user, stats] = await Promise.all([
    listGames({ sort: "popular", limit: 11 }),
    listGames({ sort: "top", limit: 8 }),
    listGames({ sort: "new", limit: 6 }),
    mostImproved(),
    getUser(),
    Promise.all([
      db.select({ n: sql<number>`count(*)::int` }).from(games).where(sql`${games.status} = 'published'`),
      db.select({ n: sql<number>`count(*)::int` }).from(users),
      db.select({ n: sql<number>`count(*)::int` }).from(pullRequests).where(sql`${pullRequests.status} = 'merged'`),
    ]),
  ]);
  const s = { games: stats[0][0].n, creators: stats[1][0].n, merged: stats[2][0].n };

  const featured = popular[0];
  const runners = popular.slice(1, 5);
  const topRated = [...top].filter((r) => r.game.ratingCount > 0).slice(0, 6);

  return (
    <div className="grid gap-5 lg:grid-cols-[210px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)_270px]">
      <CategoryNav />

      <div className="min-w-0 space-y-5">
        {featured && <Featured item={featured} runners={runners} />}

        <Shelf title="Top Games" href="/browse?sort=popular">
          {popular.slice(1).map(({ game, owner }) => (
            <GameCard key={game.id} game={game} owner={owner} />
          ))}
        </Shelf>

        {improved.length > 0 && (
          <Shelf title="Getting Better" href="/browse" hint="Most community pull requests merged this month">
            {improved.map(({ game, owner, merged }) => (
              <GameCard key={game.id} game={game} owner={owner} badge={`${merged} merged`} />
            ))}
          </Shelf>
        )}

        <Shelf title="New Games" href="/browse?sort=new">
          {fresh.map(({ game, owner }) => (
            <GameCard key={game.id} game={game} owner={owner} badge="New" />
          ))}
        </Shelf>

        <section className="grid gap-3 md:grid-cols-3">
          {[
            ["1", "Play", "Every game runs in your browser, on desktop and mobile. Free players get 30 minutes a day; Pro is unlimited."],
            ["2", "Fork & improve", "Found a bug or have an idea? Fork the game, edit it in the browser, and open a pull request with a playable preview."],
            ["3", "Get paid", "Half of subscription revenue goes to creators by play time. Merged contributors get a share of the game's earnings."],
          ].map(([n, t, d]) => (
            <div key={t} className="card flex gap-3 p-4">
              <span className="retro-title flex size-10 shrink-0 items-center justify-center rounded-full text-xl" style={{ background: "linear-gradient(180deg,#ffb95a,#f07800)", border: "2px solid #b95400" }}>{n}</span>
              <div>
                <p className="h-display text-lg font-extrabold text-navy">{t}</p>
                <p className="mt-1 text-sm text-muted">{d}</p>
              </div>
            </div>
          ))}
        </section>
      </div>

      <aside className="space-y-5 lg:col-span-2 xl:col-span-1 xl:col-start-3 xl:row-start-1">
        <div className="box">
          <h2 className="box-title box-title-orange">Play. Fork. Improve.</h2>
          <div className="box-body space-y-3 text-sm">
            <p className="text-muted">Games made by everyone. Suggest a fix or add a feature, and when the creator merges it you share in what the game earns.</p>
            <div className="grid grid-cols-3 gap-1.5 text-center">
              {[[s.games, "games"], [s.creators, "players"], [s.merged, "merged"]].map(([n, l]) => (
                <div key={l} className="bevel-inset rounded-lg py-1.5">
                  <p className="h-display text-lg font-black text-brand-2">{n}</p>
                  <p className="text-[11px] font-semibold uppercase text-dim">{l}</p>
                </div>
              ))}
            </div>
            <Link href={user ? "/new" : "/signup?next=/new"} className="btn-primary w-full">Publish your game</Link>
            <Link href="/browse" className="btn-ghost w-full">Play now</Link>
          </div>
        </div>

        {topRated.length > 0 && (
          <div className="box">
            <h2 className="box-title">Top Rated <Link href="/browse?sort=top">More</Link></h2>
            <ol className="divide-y divide-line">
              {topRated.map(({ game, owner }, i) => {
                const t = thumbUrl(game);
                return (
                  <li key={game.id}>
                    <Link href={`/g/${owner.username}/${game.slug}`} className="group flex items-center gap-2.5 px-3 py-2 hover:bg-panel-2">
                      <span className="retro-title-dark w-4 text-center text-lg">{i + 1}</span>
                      {t ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t} alt="" className="size-11 shrink-0 rounded-md border border-[#7fa0c8] object-cover" loading="lazy" />
                      ) : (
                        <span className="size-11 shrink-0 rounded-md bg-panel-2" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-extrabold text-navy group-hover:text-brand" style={{ fontFamily: "var(--font-display)" }}>{game.title}</span>
                        <Stars value={game.ratingSum / game.ratingCount} size={12} />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        <div className="box">
          <h2 className="box-title">Go Pro</h2>
          <div className="box-body text-sm text-muted">
            <p>Unlimited play on every game, and half of your subscription goes to the creators you play.</p>
            <Link href="/pro" className="btn-blue mt-3 w-full">See Pro <span className="pro-badge">PRO</span></Link>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Featured({ item, runners }: { item: { game: Game; owner: { username: string } }; runners: { game: Game; owner: { username: string } }[] }) {
  const { game, owner } = item;
  const thumb = thumbUrl(game);
  const href = `/g/${owner.username}/${game.slug}`;
  const cat = CATEGORIES.find((c) => c.id === game.category)?.label ?? game.category;
  return (
    <section className="box">
      <h2 className="box-title box-title-orange">
        <span className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z" fill="#fff" /></svg>
          Featured Game
        </span>
        <span className="hidden items-center gap-1.5 sm:flex" aria-hidden>
          <span className="size-2 rounded-full bg-white" /><span className="size-2 rounded-full bg-white/50" /><span className="size-2 rounded-full bg-white/50" /><span className="size-2 rounded-full bg-white/50" />
        </span>
      </h2>
      <div className="sunburst relative grid gap-5 p-4 sm:grid-cols-[minmax(0,320px)_1fr] sm:p-5">
        <Link href={href} className="group relative block aspect-square max-h-[320px] overflow-hidden rounded-xl border-[5px] border-white shadow-[0_0_0_2px_#0d3a73,0_14px_24px_-8px_rgba(0,30,80,.8)] transition hover:-rotate-1 hover:scale-[1.02]">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-brand-2 to-brand" />
          )}
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/70 to-transparent pb-3 pt-10 text-lg font-black text-white" style={{ fontFamily: "var(--font-display)" }}>
            ▶ PLAY
          </span>
        </Link>
        <div className="flex min-w-0 flex-col justify-center gap-3">
          <span className="chip self-start !border-white/60 !bg-white/90">{cat}</span>
          <h3 className="retro-title text-3xl leading-tight sm:text-5xl">{game.title}</h3>
          <div className="flex flex-wrap items-center gap-3 rounded-full bg-white/90 px-3 py-1.5 text-sm self-start shadow-[inset_0_1px_0_#fff]">
            <Stars value={game.ratingCount ? game.ratingSum / game.ratingCount : 0} size={16} />
            <span className="font-semibold text-muted">{compact(game.playCount)} plays</span>
            <span className="text-dim">by {owner.username}</span>
          </div>
          {game.description && <p className="line-clamp-3 max-w-xl text-[15px] font-medium text-white [text-shadow:0_1px_2px_rgba(0,30,80,.7)]">{game.description}</p>}
          <div className="flex flex-wrap gap-3 pt-1">
            <Link href={href} className="btn-primary px-8 py-3 text-lg">Play now</Link>
            <Link href="/browse" className="btn-ghost px-5 py-3 text-base">More games</Link>
          </div>
        </div>
      </div>
      {runners.length > 0 && (
        <div className="grid grid-cols-4 gap-2 border-t border-[#0f4a94] bg-gradient-to-b from-[#0f4f9e] to-[#0a3c7c] p-2">
          {runners.map(({ game: g, owner: o }) => {
            const t = thumbUrl(g);
            return (
              <Link key={g.id} href={`/g/${o.username}/${g.slug}`} className="group flex items-center gap-2 rounded-lg p-1 text-white hover:bg-white/15">
                {t && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t} alt="" className="size-10 shrink-0 rounded-md border-2 border-white/80 object-cover sm:size-12" loading="lazy" />
                )}
                <span className="hidden min-w-0 truncate text-xs font-extrabold sm:block" style={{ fontFamily: "var(--font-display)" }}>{g.title}</span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Shelf({ title, hint, href, children }: { title: string; hint?: string; href: string; children: React.ReactNode }) {
  return (
    <section className="box">
      <h2 className="box-title">
        <span>
          {title}
          {hint && <span className="ml-2 hidden text-xs font-semibold text-white/75 md:inline">{hint}</span>}
        </span>
        <Link href={href}>See all</Link>
      </h2>
      <div className="grid grid-cols-2 gap-2.5 bg-gradient-to-b from-[#f4f9ff] to-[#e3eefa] p-3 min-[480px]:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">{children}</div>
    </section>
  );
}
