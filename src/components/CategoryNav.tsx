import Link from "next/link";
import { CATEGORIES } from "@/lib/config";

const COLORS: Record<string, string> = {
  all: "#1b68c4",
  arcade: "#e8492f",
  action: "#f07800",
  puzzle: "#8a55d6",
  racing: "#14934f",
  platformer: "#0fa3b8",
  sports: "#c9a000",
  strategy: "#2b4f9e",
  casual: "#e2508a",
};

export function CatIcon({ id }: { id: string }) {
  const p = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "#fff", "aria-hidden": true } as const;
  switch (id) {
    case "arcade":
      return (
        <svg {...p}>
          <circle cx="12" cy="6" r="3.2" />
          <rect x="10.8" y="8" width="2.4" height="6" />
          <rect x="4" y="14" width="16" height="6" rx="2" />
        </svg>
      );
    case "action":
      return (
        <svg {...p}>
          <path d="M13.5 2 5 13.5h5.5L9.5 22 19 9.5h-5.8z" />
        </svg>
      );
    case "puzzle":
      return (
        <svg {...p}>
          <rect x="3" y="3" width="8" height="8" rx="1.5" />
          <rect x="13" y="3" width="8" height="8" rx="4" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" />
          <rect x="13" y="13" width="8" height="8" rx="1.5" />
        </svg>
      );
    case "racing":
      return (
        <svg {...p}>
          <path d="M5 3h2v18H5z" />
          <path d="M8 4h11l-2.5 4L19 12H8z" />
        </svg>
      );
    case "platformer":
      return (
        <svg {...p}>
          <rect x="3" y="16" width="18" height="5" rx="1" />
          <rect x="8" y="11" width="13" height="4" rx="1" />
          <rect x="14" y="6" width="7" height="4" rx="1" />
        </svg>
      );
    case "sports":
      return (
        <svg {...p} fill="none" stroke="#fff" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
        </svg>
      );
    case "strategy":
      return (
        <svg {...p}>
          <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" />
        </svg>
      );
    case "casual":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="10" />
          <circle cx="8.5" cy="10" r="1.6" fill="#333" />
          <circle cx="15.5" cy="10" r="1.6" fill="#333" />
          <path d="M7 14c1 3.5 9 3.5 10 0z" fill="#333" />
        </svg>
      );
    default:
      return (
        <svg {...p}>
          <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
        </svg>
      );
  }
}

/** Left-hand category list on desktop, horizontal scrolling strip on phones. */
export function CategoryNav({ active, sort }: { active?: string; sort?: string }) {
  const items = [{ id: "all", label: "All Games" }, ...CATEGORIES] as { id: string; label: string }[];
  return (
    <nav aria-label="Categories" className="box lg:self-start">
      <h2 className="box-title hidden lg:flex">Categories</h2>
      <ul className="scroll-thin flex gap-1 overflow-x-auto p-1.5 lg:flex-col lg:overflow-visible lg:p-2">
        {items.map((c) => {
          const on = (active ?? "all") === c.id;
          const href = c.id === "all" ? (sort ? `/browse?sort=${sort}` : "/browse") : `/browse?category=${c.id}${sort ? `&sort=${sort}` : ""}`;
          return (
            <li key={c.id} className="shrink-0">
              <Link href={href} className="cat-chip" aria-current={on ? "true" : undefined}>
                <span className="cat-icon" style={{ "--c": COLORS[c.id] } as React.CSSProperties}>
                  <CatIcon id={c.id} />
                </span>
                {c.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
