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
  const monthly = config.proMonthlyCents / 100;
  const yearly = config.proYearlyCents / 100;
  const isPro = user?.plan === "pro";
  return (
    <div className="mx-auto mt-4 max-w-4xl space-y-6">
      <div className="sunburst rounded-xl border border-[#0f4a94] px-5 py-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,.6),0_10px_20px_-12px_rgba(0,40,100,.7)]">
        <h1 className="retro-title text-4xl sm:text-5xl">
          Play everything. <span className="text-[#ffd34d]">Pay the creators.</span>
        </h1>
        <p className="mx-auto mt-3 max-w-2xl font-medium text-white [text-shadow:0_1px_2px_rgba(0,30,80,.7)]">
          {Math.round(config.creatorPoolShare * 100)}% of every Pro subscription goes straight to the people who make and improve the games you play, split by how long you play each one.
        </p>
      </div>
      {sp.success && <p className="rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-center font-semibold text-ok">Welcome to Pro! Unlimited play is on.</p>}
      {sp.cancelled && <p className="card px-4 py-3 text-center text-muted">Your plan is back to Free.</p>}
      <ErrorNote message={sp.error} />

      <div className="grid gap-6 md:grid-cols-2">
        <div className="box">
          <h2 className="box-title text-lg">Visitor</h2>
          <div className="p-6">
          <p className="retro-title-dark text-5xl">$0</p>
          <ul className="mt-6 space-y-2 text-sm text-muted">
            <li>✓ Browse every game and profile</li>
            <li>✓ Play the free games, no account needed</li>
            <li>✗ No account: sign-in needs a subscription</li>
          </ul>
          </div>
        </div>
        <div className="box relative !border-brand shadow-[0_0_0_3px_rgba(240,120,0,.35),0_14px_24px_-12px_rgba(120,50,0,.6)]">
          <h2 className="box-title box-title-orange text-lg">Pro <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-black tracking-wider text-brand [text-shadow:none]">BEST VALUE</span></h2>
          <div className="p-6">
          <p className="retro-title-dark text-5xl">
            ${monthly}
            <span className="text-base font-bold text-muted [text-shadow:none]"> / month</span>
          </p>
          <p className="mt-1 text-sm text-muted">or ${yearly} / year (2 months free) · {config.trialDays}-day free trial on both</p>
          <ul className="mt-6 space-y-2 text-sm font-medium text-ink">
            <li className="text-ink">✓ Every game on the site, unlimited play</li>
            <li>✓ Publish games, fork, open issues and pull requests</li>
            <li>✓ Half of your subscription goes to creators you play</li>
            <li>✓ PRO badge on your profile and comments</li>
            <li>✓ Early access to new releases</li>
          </ul>
          <div className="mt-8">
            {!user ? (
              <Link href="/signup?next=/pro" className="btn-primary w-full">Start your free trial</Link>
            ) : isPro ? (
              <form action={manageBilling}>
                <SubmitButton className="btn-ghost w-full">{stripeEnabled() ? "Manage billing" : "Cancel Pro (dev mode)"}</SubmitButton>
              </form>
            ) : !stripeEnabled() && !devBillingAllowed() ? (
              <button disabled className="btn-ghost w-full">Pro is coming soon</button>
            ) : (
              <form action={startCheckout} className="space-y-2">
                <select name="interval" className="input" defaultValue="month" aria-label="Billing period">
                  <option value="month">${monthly} / month</option>
                  <option value="year">${yearly} / year (2 months free)</option>
                </select>
                <SubmitButton className="btn-primary w-full" pendingText="Redirecting…">
                  {stripeEnabled() ? `Start ${config.trialDays}-day free trial` : "Activate Pro (dev mode, no payment)"}
                </SubmitButton>
              </form>
            )}
            {devBillingAllowed() && <p className="mt-2 text-center text-xs text-dim">Stripe isn&apos;t configured, so this toggles Pro for testing.</p>}
            <p className="mt-2 text-center text-xs text-dim">Cancel any time before the trial ends and you won&apos;t be charged.</p>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
