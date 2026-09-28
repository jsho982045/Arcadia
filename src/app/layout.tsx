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
      <body className="min-h-screen">
        <Header />
        <main className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6">{children}</main>
        <footer className="border-t border-line py-10 text-sm text-dim">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 sm:px-6">
            <p>
              © {new Date().getFullYear()} {config.appName}. Games belong to their creators.
            </p>
            <nav className="flex gap-5">
              <Link href="/about" className="hover:text-ink">How it works</Link>
              <Link href="/pro" className="hover:text-ink">Pro</Link>
              <Link href="/guidelines" className="hover:text-ink">Guidelines</Link>
              <Link href="/terms" className="hover:text-ink">Terms</Link>
              <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
