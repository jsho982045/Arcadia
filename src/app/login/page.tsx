import Link from "next/link";
import { login } from "@/app/actions/auth";
import { ErrorNote } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto mt-8 max-w-sm">
      <form action={login} className="box">
        <h1 className="box-title text-lg">Welcome back</h1>
        <div className="space-y-4 bg-gradient-to-b from-white to-[#eaf3fc] p-5">
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
        <SubmitButton className="btn-primary w-full !py-2.5 text-base" pendingText="Signing in…">Sign in</SubmitButton>
        </div>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        New here? <Link href={`/signup${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ""}`} className="link">Start your free trial</Link>
      </p>
    </div>
  );
}
