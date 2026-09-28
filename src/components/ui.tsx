import Link from "next/link";
import type { CheckReport, Game, User } from "@/lib/db/schema";
import { config } from "@/lib/config";

const AVATAR_COLORS = ["#ff3d8b", "#7c5cff", "#22d3ee", "#34d399", "#fbbf24", "#fb7185", "#a78bfa", "#f97316"];

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const bg = AVATAR_COLORS[h % AVATAR_COLORS.length];
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-[#0c0a17]"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.45 }}
      aria-hidden
    >
      {name.trim()[0]?.toUpperCase() || "?"}
    </span>
  );
}

export function UserLink({ user, avatar = true }: { user: Pick<User, "username" | "displayName">; avatar?: boolean }) {
  return (
    <Link href={`/u/${user.username}`} className="inline-flex items-center gap-1.5 font-medium text-ink hover:underline">
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

export function Rating({ sum, count }: { sum: number; count: number }) {
  if (!count) return <span className="text-dim">No ratings</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-warn">★</span> {(sum / count).toFixed(1)} <span className="text-dim">({count})</span>
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: "bg-ok/15 text-ok border-ok/30",
    merged: "bg-brand-2/20 text-[#b7a6ff] border-brand-2/40",
    closed: "bg-bad/10 text-bad border-bad/30",
    published: "bg-ok/15 text-ok border-ok/30",
    review: "bg-warn/15 text-warn border-warn/30",
    rejected: "bg-bad/10 text-bad border-bad/30",
    fork: "bg-panel-2 text-muted border-line",
    archived: "bg-panel-2 text-dim border-line",
  };
  const label: Record<string, string> = { review: "In review", fork: "Fork" };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${map[status] ?? "border-line"}`}>{label[status] ?? status}</span>;
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
      <p className="h-display text-lg font-bold">{title}</p>
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
