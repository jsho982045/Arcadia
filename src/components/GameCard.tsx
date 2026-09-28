import Link from "next/link";
import type { Game, User } from "@/lib/db/schema";
import { thumbUrl } from "./ui";

export function GameCard({ game, owner, badge }: { game: Game; owner: Pick<User, "username">; badge?: string }) {
  const thumb = thumbUrl(game);
  return (
    <Link href={`/g/${owner.username}/${game.slug}`} className="group block" data-testid="game-card">
      <div className="relative aspect-square overflow-hidden rounded-2xl border border-line bg-panel-2 transition group-hover:-translate-y-1 group-hover:border-brand-2/60 group-hover:shadow-[0_18px_40px_-18px_rgba(124,92,255,.7)]">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand/40 to-brand-2/40">
            <span className="h-display px-4 text-center text-2xl font-black">{game.title}</span>
          </div>
        )}
        {badge && <span className="absolute left-2 top-2 rounded-full bg-bg/80 px-2 py-0.5 text-xs font-semibold text-ink backdrop-blur">{badge}</span>}
        <span className="absolute inset-x-0 bottom-0 flex translate-y-full items-center justify-center bg-gradient-to-t from-bg/95 to-transparent pb-3 pt-8 text-sm font-bold opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100">
          ▶ Play
        </span>
      </div>
      <div className="mt-2 px-0.5">
        <p className="truncate font-semibold">{game.title}</p>
        <p className="flex items-center justify-between text-xs text-dim">
          <span className="truncate">by {owner.username}</span>
          <span>
            {game.ratingCount ? `★ ${(game.ratingSum / game.ratingCount).toFixed(1)}` : ""} {game.playCount ? `· ${compact(game.playCount)} plays` : ""}
          </span>
        </p>
      </div>
    </Link>
  );
}

export function compact(n: number) {
  return Intl.NumberFormat("en", { notation: "compact" }).format(n);
}
