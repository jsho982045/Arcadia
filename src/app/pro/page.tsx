import Link from "next/link";
import { getUser } from "@/lib/auth";
import { config, devBillingAllowed, stripeEnabled } from "@/lib/config";
import { manageBilling, startCheckout } from "@/app/actions/billing";
import { ErrorNote } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Pro" };

export default async function ProPage({ searchParams }: { searchParams: Promise<{ success?: string; cancelled?: string; error?: string }> }) {
  const sp = await searchParams;
  const user = await getUser();
  const price = (config.proPriceCents / 100).toFixed(2);
  const isPro = user?.plan === "pro";
  const freeMin = Math.round(config.freeDailySeconds / 60);
  return (
    <div className="mx-auto mt-12 max-w-4xl space-y-10">
      <div className="text-center">
        <h1 className="h-display text-4xl font-black sm:text-5xl">
          Play everything. <span className="bg-gradient-to-r from-brand to-brand-2 bg-clip-text text-transparent">Pay the creators.</span>
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-muted">
          {Math.round(config.creatorPoolShare * 100)}% of every Pro subscription goes straight to the people who make and improve the games you play, split by how long you play each one.
        </p>
      </div>
      {sp.success && <p className="rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-center text-ok">Welcome to Pro! Unlimited play is on.</p>}
      {sp.cancelled && <p className="rounded-xl border border-line bg-panel px-4 py-3 text-center text-muted">Your plan is back to Free.</p>}
      <ErrorNote message={sp.error} />

      <div className="grid gap-6 md:grid-cols-2">
        <div className="card p-7">
          <p className="h-display text-xl font-bold">Free</p>
          <p className="h-display mt-2 text-4xl font-black">$0</p>
          <ul className="mt-6 space-y-2 text-sm text-muted">
            <li>✓ Every game on the site</li>
            <li>✓ {freeMin} minutes of play a day</li>
            <li>✓ Publish games, open issues and pull requests</li>
            <li>✓ Leaderboards and cloud saves</li>
          </ul>
          {!user && <Link href="/signup" className="btn-ghost mt-8 w-full">Join free</Link>}
        </div>
        <div className="card relative overflow-hidden border-brand/50 p-7">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand/30 blur-3xl" />
          <p className="h-display text-xl font-bold text-brand">Pro</p>
          <p className="h-display mt-2 text-4xl font-black">
            ${price}
            <span className="text-base font-medium text-muted"> / month</span>
          </p>
          <ul className="mt-6 space-y-2 text-sm">
            <li>✓ Unlimited play, every game</li>
            <li>✓ Half of your subscription goes to creators you play</li>
            <li>✓ PRO badge on your profile and comments</li>
            <li>✓ Early access to new releases</li>
          </ul>
          <div className="mt-8">
            {!user ? (
              <Link href="/signup?next=/pro" className="btn-primary w-full">Create an account to subscribe</Link>
            ) : isPro ? (
              <form action={manageBilling}>
                <SubmitButton className="btn-ghost w-full">{stripeEnabled() ? "Manage billing" : "Cancel Pro (dev mode)"}</SubmitButton>
              </form>
            ) : !stripeEnabled() && !devBillingAllowed() ? (
              <button disabled className="btn-ghost w-full">Pro is coming soon</button>
            ) : (
              <form action={startCheckout}>
                <SubmitButton className="btn-primary w-full" pendingText="Redirecting…">
                  {stripeEnabled() ? `Subscribe for $${price}/month` : "Activate Pro (dev mode, no payment)"}
                </SubmitButton>
              </form>
            )}
            {devBillingAllowed() && <p className="mt-2 text-center text-xs text-dim">Stripe isn&apos;t configured, so this toggles Pro for testing.</p>}
            <p className="mt-2 text-center text-xs text-dim">Cancel any time. Renews monthly until you cancel.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
