import Link from "next/link";
import { listGames } from "@/lib/queries";
import { GameCard } from "@/components/GameCard";
import { CATEGORIES } from "@/lib/config";
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
  return (
    <div className="mt-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="h-display text-3xl font-extrabold">{sp.q ? `Results for “${sp.q}”` : category ? CATEGORIES.find((c) => c.id === category)?.label + " games" : "All games"}</h1>
          <p className="text-sm text-muted">{rows.length} game{rows.length === 1 ? "" : "s"}</p>
        </div>
        <form action="/browse" className="flex w-full gap-2 sm:w-auto">
          {category && <input type="hidden" name="category" value={category} />}
          <input name="q" defaultValue={sp.q} placeholder="Search…" className="input sm:w-64" />
          <button className="btn-ghost">Search</button>
        </form>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={qs({ category: undefined })} className={`chip px-3 py-1 text-sm ${!category ? "border-brand-2 text-ink" : ""}`}>All</Link>
        {CATEGORIES.map((c) => (
          <Link key={c.id} href={qs({ category: c.id })} className={`chip px-3 py-1 text-sm ${category === c.id ? "border-brand-2 text-ink" : ""}`}>
            {c.label}
          </Link>
        ))}
        <span className="mx-2 hidden h-5 w-px bg-line sm:block" />
        {(["popular", "top", "new"] as const).map((s) => (
          <Link key={s} href={qs({ sort: s })} className={`rounded-lg px-3 py-1 text-sm capitalize ${sort === s ? "bg-panel-2 text-ink" : "text-muted hover:text-ink"}`}>
            {s === "top" ? "Top rated" : s}
          </Link>
        ))}
      </div>
      {rows.length ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {rows.map(({ game, owner }) => (
            <GameCard key={game.id} game={game} owner={owner} />
          ))}
        </div>
      ) : (
        <Empty title="No games found">Try another search, or <Link href="/new" className="link">publish the first one</Link>.</Empty>
      )}
    </div>
  );
}
