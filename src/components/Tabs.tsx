"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Tabs({ tabs }: { tabs: { href: string; label: string; count?: number }[] }) {
  const path = decodeURIComponent(usePathname());
  // The longest matching prefix wins, so /pulls/3 highlights "Pull requests" and not "Play".
  // The first tab (Play) only matches exactly; other pages like /edit highlight nothing.
  const active = tabs.find((t) => path === t.href) ?? [...tabs.slice(1)].sort((a, b) => b.href.length - a.href.length).find((t) => path.startsWith(t.href + "/"));
  return (
    <nav className="mt-5 flex items-end gap-1 overflow-x-auto border-b-[3px] border-navy px-1 pt-1 scroll-thin">
      {tabs.map((t) => {
        const on = active?.href === t.href;
        return (
          <Link key={t.href} href={t.href} className="tab" aria-current={on ? "page" : undefined}>
            {t.label}
            {typeof t.count === "number" && t.count > 0 && (
              <span className="rounded-full bg-brand px-1.5 text-[11px] font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,.5)] [text-shadow:none]">{t.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
