import Link from "next/link";
import type { Game, User } from "@/lib/db/schema";
import { Stars, thumbUrl } from "./ui";

export function GameCard({ game, owner, badge }: { game: Game; owner: Pick<User, "username">; badge?: string }) {
  const thumb = thumbUrl(game);
  const avg = game.ratingCount ? game.ratingSum / game.ratingCount : 0;
  return (
    <Link href={`/g/${owner.username}/${game.slug}`} className="tile group" data-testid="game-card">
      <div className="tile-thumb">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-full w-full object-cover transition duration-200 group-hover:scale-105" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-2/40 to-brand/40">
            <span className="retro-title px-3 text-center text-xl">{game.title}</span>
          </div>
        )}
        {badge && <span className="tile-ribbon">{badge}</span>}
        <span className="tile-play">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M1 0l9 5-9 5z" fill="#fff" /></svg>
          PLAY
        </span>
      </div>
      <div className="px-0.5 pb-0.5 pt-1.5">
        <p className="truncate text-[13px] font-extrabold leading-tight text-navy group-hover:text-brand" style={{ fontFamily: "var(--font-display)" }}>{game.title}</p>
        <div className="mt-1 flex items-center justify-between gap-1">
          <Stars value={avg} size={12} />
          <span className="text-[11px] font-semibold text-dim">{compact(game.playCount)} plays</span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-dim">by {owner.username}</p>
      </div>
    </Link>
  );
}

export function compact(n: number) {
  return Intl.NumberFormat("en", { notation: "compact" }).format(n);
}
