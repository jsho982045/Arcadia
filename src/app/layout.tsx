import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource/outfit/600.css";
import "@fontsource/outfit/800.css";
import "@fontsource/outfit/900.css";
import "./globals.css";
import { Header } from "@/components/Header";
import { config } from "@/lib/config";
import Link from "next/link";


export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: `${config.appName} — play, remix and build games together`, template: `%s · ${config.appName}` },
  description: "Free browser games made by the community. Play instantly, fork any game, and suggest improvements the creator can merge.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <Header />
        <main className="mx-auto w-full flex-1 max-w-[1240px] px-3 pb-16 pt-5 sm:px-5">{children}</main>
        <footer className="mt-4 border-t-[3px] border-brand text-sm text-[#cfe4ff]" style={{ background: "linear-gradient(180deg,#134f9e,#0a2f63)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.25)" }}>
          <div className="mx-auto grid max-w-[1240px] gap-8 px-5 py-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <div>
              <p className="retro-title text-3xl">{config.appName}</p>
              <p className="mt-2 max-w-xs text-[#a9c7ee]">Free browser games made by the community. Play instantly, fork any game and make it better.</p>
              <Link href="/signup" className="btn-primary mt-4">Join free</Link>
            </div>
            <FooterCol title="Play">
              <Link href="/browse?sort=popular">Top games</Link>
              <Link href="/browse?sort=new">New games</Link>
              <Link href="/browse?sort=top">Top rated</Link>
              <Link href="/browse">All categories</Link>
            </FooterCol>
            <FooterCol title="Create">
              <Link href="/new">Publish a game</Link>
              <Link href="/dashboard">Creator dashboard</Link>
              <Link href="/about">How it works</Link>
              <Link href="/pro">Pro</Link>
            </FooterCol>
            <FooterCol title="Legal">
              <Link href="/guidelines">Guidelines</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/privacy">Privacy</Link>
            </FooterCol>
          </div>
          <div className="border-t border-white/10 bg-black/20 py-3 text-center text-xs text-[#8fb0da]">
            © {new Date().getFullYear()} {config.appName}. Games belong to their creators.
          </div>
        </footer>
      </body>
    </html>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-3 border-b border-white/15 pb-2 text-sm font-extrabold uppercase tracking-wider text-white" style={{ fontFamily: "var(--font-display)" }}>{title}</p>
      <nav className="flex flex-col gap-2 [&_a]:font-medium [&_a:hover]:text-white [&_a:hover]:underline">{children}</nav>
    </div>
  );
}
