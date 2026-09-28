import Link from "next/link";
import { signup } from "@/app/actions/auth";
import { ErrorNote } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Join" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto mt-12 max-w-md">
      <h1 className="h-display text-3xl font-extrabold">Join free</h1>
      <p className="mb-6 mt-1 text-muted">Play every game, save your progress, publish your own and help improve others.</p>
      <form action={signup} className="card space-y-4 p-6">
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
        <label className="flex items-start gap-2 text-sm text-muted">
          <input type="checkbox" name="age" className="mt-1 accent-[#7c5cff]" required /> I am 13 years old or older.
        </label>
        <label className="flex items-start gap-2 text-sm text-muted">
          <input type="checkbox" name="terms" className="mt-1 accent-[#7c5cff]" required />
          <span>
            I agree to the <Link href="/terms" className="link">Terms</Link>, <Link href="/privacy" className="link">Privacy Policy</Link> and{" "}
            <Link href="/guidelines" className="link">Community Guidelines</Link>.
          </span>
        </label>
        <SubmitButton className="btn-primary w-full" pendingText="Creating account…">Create account</SubmitButton>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        Already have an account? <Link href="/login" className="link">Sign in</Link>
      </p>
    </div>
  );
}
