"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Tabs({ tabs }: { tabs: { href: string; label: string; count?: number }[] }) {
  const path = decodeURIComponent(usePathname());
  // The longest matching prefix wins, so /pulls/3 highlights "Pull requests" and not "Play".
  // The first tab (Play) only matches exactly; other pages like /edit highlight nothing.
  const active = tabs.find((t) => path === t.href) ?? [...tabs.slice(1)].sort((a, b) => b.href.length - a.href.length).find((t) => path.startsWith(t.href + "/"));
  return (
    <nav className="mt-5 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => {
        const on = active?.href === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium ${on ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t.label}
            {typeof t.count === "number" && t.count > 0 && <span className="rounded-full bg-panel-2 px-2 text-xs text-muted">{t.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
