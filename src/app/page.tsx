import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { games, pullRequests, users } from "@/lib/db/schema";
import { listGames, mostImproved } from "@/lib/queries";
import { GameCard } from "@/components/GameCard";
import { CATEGORIES } from "@/lib/config";
import { getUser } from "@/lib/auth";
import { thumbUrl } from "@/components/ui";

export default async function Home() {
  const [popular, fresh, improved, user, stats] = await Promise.all([
    listGames({ sort: "popular", limit: 12 }),
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

  return (
    <div className="space-y-14">
      <section className="relative mt-6 overflow-hidden rounded-3xl border border-line bg-panel px-6 py-12 sm:px-12 sm:py-16">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-40 h-80 w-80 rounded-full bg-brand-2/30 blur-3xl" />
        <div className="pointer-events-none absolute right-10 top-1/2 hidden -translate-y-1/2 rotate-6 grid-cols-2 gap-4 lg:grid">
          {popular.slice(0, 4).map(({ game }, i) => {
            const t = thumbUrl(game);
            return t ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={game.id} src={t} alt="" className={`h-40 w-40 rounded-2xl border border-line object-cover shadow-2xl ${i % 2 ? "translate-y-8" : ""}`} />
            ) : null;
          })}
        </div>
        <div className="relative max-w-2xl">
          <p className="chip mb-4 border-brand/40 text-brand">Games made by everyone</p>
          <h1 className="h-display text-4xl font-black leading-[1.05] sm:text-6xl">
            Play it. Fork it.
            <br />
            <span className="bg-gradient-to-r from-brand to-brand-2 bg-clip-text text-transparent">Make it better.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            Browser games you can play instantly, made by the community. Every game is open: suggest a fix or add a feature, and when the creator merges it you share in what the game earns.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/browse" className="btn-primary px-6 py-3 text-base">Play now</Link>
            <Link href={user ? "/new" : "/signup?next=/new"} className="btn-ghost px-6 py-3 text-base">Publish your game</Link>
          </div>
          <p className="mt-8 text-sm text-dim">
            {s.games} games · {s.creators} players &amp; creators · {s.merged} community improvements merged
          </p>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <Link key={c.id} href={`/browse?category=${c.id}`} className="chip px-4 py-1.5 text-sm hover:border-brand-2 hover:text-ink">
            {c.label}
          </Link>
        ))}
      </div>

      <Shelf title="Popular right now" href="/browse?sort=popular">
        {popular.map(({ game, owner }) => (
          <GameCard key={game.id} game={game} owner={owner} />
        ))}
      </Shelf>

      {improved.length > 0 && (
        <Shelf title="Getting better" subtitle="Games with the most community pull requests merged this month" href="/browse">
          {improved.map(({ game, owner, merged }) => (
            <GameCard key={game.id} game={game} owner={owner} badge={`${merged} merged`} />
          ))}
        </Shelf>
      )}

      <Shelf title="New arrivals" href="/browse?sort=new">
        {fresh.map(({ game, owner }) => (
          <GameCard key={game.id} game={game} owner={owner} badge="New" />
        ))}
      </Shelf>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          ["1. Play", "Every game runs in your browser, on desktop and mobile. Free players get 30 minutes a day; Pro is unlimited."],
          ["2. Fork & improve", "Found a bug or have an idea? Fork the game, edit it in the browser, and open a pull request with a playable preview."],
          ["3. Get paid", "Half of subscription revenue goes to creators by play time. Merged contributors get a share of the game's earnings."],
        ].map(([t, d]) => (
          <div key={t} className="card p-6">
            <p className="h-display text-lg font-bold">{t}</p>
            <p className="mt-2 text-sm text-muted">{d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

function Shelf({ title, subtitle, href, children }: { title: string; subtitle?: string; href: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="h-display text-2xl font-extrabold">{title}</h2>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        <Link href={href} className="text-sm text-muted hover:text-ink">See all →</Link>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">{children}</div>
    </section>
  );
}
