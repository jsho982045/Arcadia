import Link from "next/link";
import { login } from "@/app/actions/auth";
import { ErrorNote } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="h-display mb-6 text-3xl font-extrabold">Welcome back</h1>
      <form action={login} className="card space-y-4 p-6">
        <ErrorNote message={sp.error} />
        <input type="hidden" name="next" value={sp.next ?? "/"} />
        <div>
          <label className="label" htmlFor="login">Username or email</label>
          <input id="login" name="login" className="input" autoComplete="username" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
        </div>
        <SubmitButton className="btn-primary w-full" pendingText="Signing in…">Sign in</SubmitButton>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        New here? <Link href={`/signup${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ""}`} className="link">Start your free trial</Link>
      </p>
    </div>
  );
}
