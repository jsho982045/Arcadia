import Link from "next/link";
import type { CheckReport, Game, User } from "@/lib/db/schema";
import { config } from "@/lib/config";

const AVATAR_COLORS = ["#ff8a2a", "#4d9bf0", "#3cc4d6", "#4ccf85", "#ffcf3f", "#f0708a", "#9b8cf0", "#ff6a3d"];

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const bg = AVATAR_COLORS[h % AVATAR_COLORS.length];
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full border-2 border-white font-extrabold text-white shadow-[0_1px_3px_rgba(10,40,90,.5)] [text-shadow:0_1px_0_rgba(0,0,0,.35)]"
      style={{ width: size, height: size, background: `linear-gradient(180deg, rgba(255,255,255,.35), rgba(0,0,0,.08)), ${bg}`, fontSize: size * 0.45 }}
      aria-hidden
    >
      {name.trim()[0]?.toUpperCase() || "?"}
    </span>
  );
}

export function UserLink({ user, avatar = true }: { user: Pick<User, "username" | "displayName">; avatar?: boolean }) {
  return (
    <Link href={`/u/${user.username}`} className="inline-flex items-center gap-1.5 font-semibold text-brand-2 hover:text-brand hover:underline">
      {avatar && <Avatar name={user.displayName} size={20} />}
      {user.username}
    </Link>
  );
}

export function timeAgo(d: Date | string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  const units: [number, string][] = [[31536000, "year"], [2592000, "month"], [604800, "week"], [86400, "day"], [3600, "hour"], [60, "minute"]];
  for (const [n, u] of units) if (s >= n) { const v = Math.floor(s / n); return `${v} ${u}${v > 1 ? "s" : ""} ago`; }
  return "just now";
}

export function thumbUrl(game: Pick<Game, "thumbnail" | "currentVersionId">) {
  if (!game.thumbnail || !game.currentVersionId) return null;
  return `${config.playOrigin}/v/${game.currentVersionId}/${game.thumbnail}`;
}

export function playUrl(versionId: string) {
  return `${config.playOrigin}/v/${versionId}/index.html`;
}

const STAR = "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z";

/** Five gold stars, partially filled to `value` (0-5). */
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const row = (fill: string, stroke: string) => (
    <span className="flex shrink-0">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" className="shrink-0" aria-hidden>
          <path d={STAR} fill={fill} stroke={stroke} strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      ))}
    </span>
  );
  const pct = Math.max(0, Math.min(5, value)) * 20;
  return (
    <span className="relative inline-flex" role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {row("#d5e2f1", "#b3c8df")}
      <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${pct}%` }}>
        {row("#ffb400", "#d98500")}
      </span>
    </span>
  );
}

export function Rating({ sum, count }: { sum: number; count: number }) {
  if (!count) return <span className="inline-flex items-center gap-1.5 text-dim"><Stars value={0} /> No ratings yet</span>;
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
      <Stars value={sum / count} /> {(sum / count).toFixed(1)} <span className="font-normal text-dim">({count})</span>
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: "bg-ok/15 text-ok border-ok/30",
    merged: "bg-brand-2/15 text-brand-2 border-brand-2/40",
    closed: "bg-bad/10 text-bad border-bad/30",
    published: "bg-ok/15 text-ok border-ok/30",
    review: "bg-warn/15 text-warn border-warn/30",
    rejected: "bg-bad/10 text-bad border-bad/30",
    fork: "bg-panel-2 text-muted border-line",
    archived: "bg-panel-2 text-dim border-line",
  };
  const label: Record<string, string> = { review: "In review", fork: "Fork" };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-extrabold capitalize ${map[status] ?? "border-line"}`}>{label[status] ?? status}</span>;
}

export function Checks({ report }: { report: CheckReport }) {
  const icon = { pass: "✓", warn: "!", fail: "✕" };
  const color = { pass: "text-ok", warn: "text-warn", fail: "text-bad" };
  return (
    <ul className="space-y-1.5 text-sm">
      {report.items.map((i, k) => (
        <li key={k} className="flex gap-2">
          <span className={`w-4 shrink-0 font-bold ${color[i.level]}`}>{icon[i.level]}</span>
          <span className="text-muted">
            {i.message} {i.file && <code className="rounded bg-panel-2 px-1 text-xs text-ink">{i.file}</code>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="retro-title-dark text-xl">{title}</p>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function ErrorNote({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{message}</p>;
}

/** Plain text with line breaks, #123 links and URLs. No HTML is ever rendered from user input. */
export function Prose({ text, base }: { text: string; base?: string }) {
  const parts = text.split(/(#\d+|https?:\/\/[^\s]+)/g);
  return (
    <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink/90">
      {parts.map((p, i) =>
        /^#\d+$/.test(p) && base ? (
          <Link key={i} href={`${base}/ref/${p.slice(1)}`} className="link">{p}</Link>
        ) : /^https?:\/\//.test(p) ? (
          <a key={i} href={p} className="link" rel="nofollow noopener noreferrer" target="_blank">{p}</a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </div>
  );
}
