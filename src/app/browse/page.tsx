import Link from "next/link";
import { listGames } from "@/lib/queries";
import { GameCard } from "@/components/GameCard";
import { CATEGORIES } from "@/lib/config";
import { CategoryNav } from "@/components/CategoryNav";
import { Empty } from "@/components/ui";

export const metadata = { title: "Browse games" };

export default async function Browse({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; sort?: string }> }) {
  const sp = await searchParams;
  const sort = sp.sort === "new" || sp.sort === "top" ? sp.sort : "popular";
  const category = CATEGORIES.some((c) => c.id === sp.category) ? sp.category : undefined;
  const rows = await listGames({ q: sp.q?.slice(0, 80), category, sort, limit: 96 });
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q: sp.q, category, sort, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/browse?${p}`;
  };
  const heading = sp.q ? `Results for “${sp.q}”` : category ? CATEGORIES.find((c) => c.id === category)?.label + " Games" : "All Games";
  return (
    <div className="grid gap-5 lg:grid-cols-[210px_minmax(0,1fr)]">
      <CategoryNav active={category} sort={sort} />
      <div className="min-w-0 space-y-4">
        <section className="box">
          <h1 className="box-title text-lg">
            <span>{heading}</span>
            <span className="text-xs font-bold text-white/80">{rows.length} game{rows.length === 1 ? "" : "s"}</span>
          </h1>
          <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-b from-[#f4f9ff] to-[#e3eefa] p-3">
            <div className="flex items-center gap-1.5">
              <span className="mr-1 text-xs font-extrabold uppercase tracking-wide text-dim">Sort</span>
              {(["popular", "top", "new"] as const).map((s) => (
                <Link key={s} href={qs({ sort: s })} className={`rounded-full px-3 py-1 text-sm font-bold capitalize transition ${sort === s ? "text-white shadow-[inset_0_1px_0_rgba(255,255,255,.5)]" : "text-brand-2 hover:bg-white"}`} style={sort === s ? { background: "linear-gradient(180deg,#ffb95a,#f07800)", border: "1px solid #b95400" } : { border: "1px solid transparent" }}>
                  {s === "top" ? "Top rated" : s}
                </Link>
              ))}
            </div>
            <form action="/browse" className="flex w-full gap-2 sm:w-auto">
              {category && <input type="hidden" name="category" value={category} />}
              <input name="q" defaultValue={sp.q} placeholder="Search…" aria-label="Search games" className="input sm:w-64" />
              <button className="btn-primary">Search</button>
            </form>
          </div>
        </section>
        {rows.length ? (
          <div className="box">
            <div className="grid grid-cols-2 gap-2.5 bg-gradient-to-b from-[#f4f9ff] to-[#e3eefa] p-3 min-[480px]:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {rows.map(({ game, owner }) => (
                <GameCard key={game.id} game={game} owner={owner} />
              ))}
            </div>
          </div>
        ) : (
          <Empty title="No games found">Try another search, or <Link href="/new" className="link">publish the first one</Link>.</Empty>
        )}
      </div>
    </div>
  );
}
