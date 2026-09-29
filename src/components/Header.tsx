import Link from "next/link";
import { getUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { Avatar } from "./ui";
import { logout } from "@/app/actions/auth";

export async function Header() {
  const user = await getUser();
  return (
    <header className="sticky top-0 z-40">
      <div className="site-header">
        <div className="mx-auto flex h-[60px] max-w-[1240px] items-center gap-3 px-3 sm:gap-4 sm:px-5">
          <Link href="/" className="group flex shrink-0 items-center gap-2" aria-label={`${config.appName} home`}>
            <Logo size={38} />
            <span className="retro-title text-[26px] leading-none tracking-tight sm:text-[30px]">
              {config.appName}
            </span>
          </Link>
          <form action="/browse" className="ml-2 hidden flex-1 md:block">
            <div className="flex max-w-lg overflow-hidden rounded-full border border-[#0b3f80] bg-white shadow-[inset_0_2px_4px_rgba(10,40,90,.35),0_1px_0_rgba(255,255,255,.35)]">
              <input name="q" placeholder="Search games, creators, tags…" aria-label="Search games" className="min-w-0 flex-1 bg-transparent px-4 py-2 text-sm text-ink outline-none placeholder:text-dim" />
              <button className="btn-primary !rounded-none !rounded-r-full !px-4 !py-0 !shadow-none" aria-label="Search">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" aria-hidden><circle cx="10" cy="10" r="6.5" /><path d="M15 15l6 6" /></svg>
              </button>
            </div>
          </form>
          <nav className="ml-auto flex items-center gap-1 text-sm sm:gap-2">
            <Link href="/browse" className="nav-link hidden sm:block">Browse</Link>
            <Link href="/new" className="nav-link hidden sm:block">Publish</Link>
            {user ? (
              <>
                {user.plan !== "pro" && (
                  <Link href="/pro" className="btn-primary !px-3 !py-1.5">Go Pro</Link>
                )}
                {user.isAdmin && <Link href="/admin" className="nav-link">Admin</Link>}
                <details className="relative">
                  <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full p-1 hover:bg-white/20">
                    <Avatar name={user.displayName} size={34} />
                    {user.plan === "pro" && <span className="pro-badge">PRO</span>}
                  </summary>
                  <div className="card absolute right-0 mt-2 w-56 overflow-hidden p-1">
                    <div className="px-3 py-2 text-xs text-dim">Signed in as <b className="text-ink">@{user.username}</b></div>
                    <MenuLink href={`/u/${user.username}`}>Your profile</MenuLink>
                    <MenuLink href="/dashboard">Creator dashboard</MenuLink>
                    <MenuLink href="/new">Publish a game</MenuLink>
                    <MenuLink href="/pro">{user.plan === "pro" ? "Manage Pro" : "Upgrade to Pro"}</MenuLink>
                    <form action={logout}>
                      <button className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-muted hover:bg-panel-2 hover:text-ink">Sign out</button>
                    </form>
                  </div>
                </details>
              </>
            ) : (
              <>
                <Link href="/login" className="btn-blue !px-3 !py-1.5">Sign in</Link>
                <Link href="/signup" className="btn-primary !px-3 !py-1.5">Join free</Link>
              </>
            )}
          </nav>
        </div>
      </div>
      <div className="site-subnav">
        <div className="mx-auto flex max-w-[1240px] items-center gap-0.5 overflow-x-auto px-2 sm:px-4">
          <Link href="/" className="subnav-link">Home</Link>
          <Link href="/browse?sort=popular" className="subnav-link">Top Games</Link>
          <Link href="/browse?sort=new" className="subnav-link">New Games</Link>
          <Link href="/browse?sort=top" className="subnav-link">Top Rated</Link>
          <Link href="/new" className="subnav-link sm:hidden">Publish</Link>
          <Link href="/about" className="subnav-link hidden sm:block">How it works</Link>
          <Link href="/pro" className="subnav-link text-[#ffcf7a]">Pro</Link>
          <form action="/browse" className="ml-auto py-1 md:hidden">
            <input name="q" placeholder="Search…" aria-label="Search games" className="w-28 rounded-full border border-[#062a57] bg-white/95 px-3 py-1 text-xs text-ink outline-none focus:w-40" />
          </form>
        </div>
      </div>
    </header>
  );
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="block rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:bg-panel-2 hover:text-ink">
      {children}
    </Link>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className="transition group-hover:-rotate-6 group-hover:scale-110">
      <defs>
        <linearGradient id="lg-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffc35e" />
          <stop offset="0.5" stopColor="#ff9a1f" />
          <stop offset="0.52" stopColor="#f07800" />
          <stop offset="1" stopColor="#ff8f10" />
        </linearGradient>
      </defs>
      <ellipse cx="20" cy="36" rx="14" ry="2.4" fill="#000" opacity="0.25" />
      <path d="M8 12h24c4 0 7 4 7.5 10l1 7c.4 3-1.6 5-4.3 4.3-2.3-.6-3.6-2.4-5-4.3H8.8c-1.4 1.9-2.7 3.700-5 4.300C1.100 34 -.9 32 -.5 29l1-7C1 16 4 12 8 12z" transform="translate(0 -3) scale(.96 1) translate(.8 0)" fill="url(#lg-body)" stroke="#8f3f00" strokeWidth="1.6" strokeLinejoin="round" />
      <rect x="8" y="14.500" width="9" height="3.200" rx="1.600" fill="#fff" stroke="#8f3f00" strokeWidth=".8" />
      <rect x="10.900" y="11.600" width="3.200" height="9" rx="1.600" fill="#fff" stroke="#8f3f00" strokeWidth=".8" />
      <circle cx="26" cy="14" r="2.400" fill="#1b68c4" stroke="#0d3a73" strokeWidth=".9" />
      <circle cx="31" cy="18" r="2.400" fill="#2fbf6b" stroke="#0a5a2e" strokeWidth=".9" />
      <path d="M31 4l1.200 2.500 2.700.4-2 1.900.5 2.700L31 10.200l-2.400 1.300.5-2.700-2-1.900 2.700-.4z" fill="#ffe04a" stroke="#b58500" strokeWidth=".7" strokeLinejoin="round" />
    </svg>
  );
}
