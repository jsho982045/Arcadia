import Link from "next/link";
import { getUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { Avatar } from "./ui";
import { logout } from "@/app/actions/auth";

export async function Header() {
  const user = await getUser();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
          <span className="h-display text-xl font-extrabold">{config.appName}</span>
        </Link>
        <form action="/browse" className="ml-2 hidden flex-1 md:block">
          <input name="q" placeholder="Search games, creators, tags…" className="input max-w-md rounded-full bg-panel" />
        </form>
        <nav className="ml-auto flex items-center gap-1 text-sm sm:gap-2">
          <Link href="/browse" className="rounded-lg px-3 py-2 text-muted hover:bg-panel hover:text-ink">Browse</Link>
          <Link href="/new" className="hidden rounded-lg px-3 py-2 text-muted hover:bg-panel hover:text-ink sm:block">Publish</Link>
          {user ? (
            <>
              {user.plan !== "pro" && (
                <Link href="/pro" className="hidden rounded-lg px-3 py-2 font-semibold text-brand hover:bg-panel sm:block">Go Pro</Link>
              )}
              {user.isAdmin && <Link href="/admin" className="rounded-lg px-3 py-2 text-muted hover:bg-panel hover:text-ink">Admin</Link>}
              <details className="relative">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full p-1 hover:bg-panel">
                  <Avatar name={user.displayName} size={32} />
                  {user.plan === "pro" && <span className="chip border-brand/40 text-brand">PRO</span>}
                </summary>
                <div className="card absolute right-0 mt-2 w-56 overflow-hidden p-1 shadow-2xl">
                  <div className="px-3 py-2 text-xs text-dim">Signed in as <b className="text-ink">@{user.username}</b></div>
                  <MenuLink href={`/u/${user.username}`}>Your profile</MenuLink>
                  <MenuLink href="/dashboard">Creator dashboard</MenuLink>
                  <MenuLink href="/new">Publish a game</MenuLink>
                  <MenuLink href="/pro">{user.plan === "pro" ? "Manage Pro" : "Upgrade to Pro"}</MenuLink>
                  <form action={logout}>
                    <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-panel-2 hover:text-ink">Sign out</button>
                  </form>
                </div>
              </details>
            </>
          ) : (
            <>
              <Link href="/login" className="rounded-lg px-3 py-2 text-muted hover:bg-panel hover:text-ink">Sign in</Link>
              <Link href="/signup" className="btn-primary">Join free</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="block rounded-lg px-3 py-2 text-sm text-muted hover:bg-panel-2 hover:text-ink">
      {children}
    </Link>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff3d8b" />
          <stop offset="1" stopColor="#7c5cff" />
        </linearGradient>
      </defs>
      <rect x="2" y="7" width="28" height="18" rx="9" fill="url(#lg)" />
      <rect x="8" y="14" width="7" height="3" rx="1.5" fill="#fff" />
      <rect x="10" y="12" width="3" height="7" rx="1.5" fill="#fff" />
      <circle cx="21" cy="13.5" r="2" fill="#fff" />
      <circle cx="24.5" cy="17.5" r="2" fill="#fff" />
    </svg>
  );
}
