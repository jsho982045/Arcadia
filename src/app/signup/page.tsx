import Link from "next/link";
import { signup } from "@/app/actions/auth";
import { ErrorNote } from "@/components/ui";
import { config, stripeEnabled } from "@/lib/config";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Join" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto mt-4 max-w-md">
      <form action={signup} className="box">
        <h1 className="box-title box-title-orange text-lg">Join Arcadia</h1>
        <div className="space-y-4 bg-gradient-to-b from-white to-[#eaf3fc] p-5">
        <p className="text-sm text-muted">
          Start your {config.trialDays}-day free trial. Play every game, publish your own and help improve others. Anyone can browse and play the free games without an account.
        </p>
        <ErrorNote message={sp.error} />
        <input type="hidden" name="next" value={sp.next ?? "/"} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="username">Username</label>
            <input id="username" name="username" className="input" autoComplete="username" required minLength={3} maxLength={24} pattern="[a-zA-Z0-9-]+" />
          </div>
          <div>
            <label className="label" htmlFor="displayName">Display name</label>
            <input id="displayName" name="displayName" className="input" maxLength={40} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="input" autoComplete="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" className="input" autoComplete="new-password" required minLength={8} />
        </div>
        <fieldset className="grid grid-cols-2 gap-3">
          <legend className="label">Plan ({config.trialDays}-day free trial on both)</legend>
          <label className="card cursor-pointer p-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-[#fff4e5] has-[:checked]:shadow-[0_0_0_2px_rgba(240,120,0,.35)]">
            <input type="radio" name="interval" value="month" defaultChecked className="mr-2 accent-[#f07800]" />
            <b>${config.proMonthlyCents / 100}</b> / month
          </label>
          <label className="card cursor-pointer p-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-[#fff4e5] has-[:checked]:shadow-[0_0_0_2px_rgba(240,120,0,.35)]">
            <input type="radio" name="interval" value="year" className="mr-2 accent-[#f07800]" />
            <b>${config.proYearlyCents / 100}</b> / year
            <span className="block text-xs text-ok">2 months free</span>
          </label>
        </fieldset>
        {!stripeEnabled() && <p className="text-xs text-dim">Payments aren&apos;t connected on this server, so no card is taken.</p>}
        <label className="flex items-start gap-2 text-sm text-muted">
          <input type="checkbox" name="age" className="mt-1 accent-[#f07800]" required /> I am 13 years old or older.
        </label>
        <label className="flex items-start gap-2 text-sm text-muted">
          <input type="checkbox" name="terms" className="mt-1 accent-[#f07800]" required />
          <span>
            I agree to the <Link href="/terms" className="link">Terms</Link>, <Link href="/privacy" className="link">Privacy Policy</Link> and{" "}
            <Link href="/guidelines" className="link">Community Guidelines</Link>.
          </span>
        </label>
        <SubmitButton className="btn-primary w-full !py-2.5 text-base" pendingText="Creating account…">Continue to start free trial</SubmitButton>
        </div>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        Already have an account? <Link href="/login" className="link">Sign in</Link>
      </p>
    </div>
  );
}
