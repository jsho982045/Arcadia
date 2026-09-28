"use server";
import { redirect } from "next/navigation";
import { eq, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { newId } from "@/lib/ids";
import { devBillingAllowed, parseInterval, stripeEnabled } from "@/lib/config";
import { createCheckout } from "@/lib/stripe";
import type { User } from "@/lib/db/schema";

/** Accounts require a subscription. Returns only if the user may sign in now; otherwise redirects to checkout (or an error). */
async function requireSubscription(u: User, interval: ReturnType<typeof parseInterval>, back: (m: string) => never) {
  if (u.plan === "pro" || u.isAdmin) return;
  if (stripeEnabled()) {
    let url: string;
    try {
      url = await createCheckout(u, interval, { signIn: true });
    } catch (e) {
      console.error("checkout failed", e);
      redirect(`/login?error=${encodeURIComponent("We couldn't start checkout. Please try signing in again in a moment.")}`);
    }
    redirect(url);
  }
  if (devBillingAllowed()) {
    await db.update(users).set({ plan: "pro", subscriptionStatus: "trialing", planInterval: interval }).where(eq(users.id, u.id)); // dev only: no payment
    return;
  }
  back("Subscriptions aren't open yet. Please check back soon.");
}

function safeNext(next: FormDataEntryValue | null) {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

const RESERVED = new Set(["admin", "api", "new", "browse", "login", "signup", "pro", "dashboard", "about", "terms", "privacy", "settings", "arcadia", "support", "help"]);

const signupSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,22}[a-z0-9])$/, "Usernames are 3-24 letters, numbers or dashes."),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
  age: z.literal("on", { error: "You must be 13 or older to join." }),
  terms: z.literal("on", { error: "Please accept the Terms and Guidelines." }),
});

export async function signup(form: FormData) {
  const next = safeNext(form.get("next"));
  const parsed = signupSchema.safeParse(Object.fromEntries(form));
  const back = (msg: string) => redirect(`/signup?error=${encodeURIComponent(msg)}&next=${encodeURIComponent(next)}`);
  if (!parsed.success) return back(parsed.error.issues[0].message);
  const { username, email, password } = parsed.data;
  if (RESERVED.has(username)) return back("That username is reserved.");
  const taken = await db.select({ id: users.id }).from(users).where(or(eq(users.username, username), eq(users.email, email))).limit(1);
  if (taken.length) return back("That username or email is already in use.");
  const id = newId();
  await db.insert(users).values({ id, username, email, displayName: String(form.get("displayName") || username).slice(0, 40) || username, passwordHash: await hashPassword(password) });
  const [created] = await db.select().from(users).where(eq(users.id, id));
  await requireSubscription(created, parseInterval(form.get("interval")), back);
  await createSession(id);
  redirect(next);
}

export async function login(form: FormData) {
  const next = safeNext(form.get("next"));
  const id = String(form.get("login") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const [u] = await db.select().from(users).where(or(eq(users.username, id), eq(users.email, id))).limit(1);
  if (!u || !(await verifyPassword(password, u.passwordHash))) {
    redirect(`/login?error=${encodeURIComponent("Wrong username or password.")}&next=${encodeURIComponent(next)}`);
  }
  if (u.banned) redirect(`/login?error=${encodeURIComponent("This account has been suspended.")}`);
  await requireSubscription(u, parseInterval(form.get("interval")), (m) => redirect(`/login?error=${encodeURIComponent(m)}`));
  await createSession(u.id);
  redirect(next);
}

export async function logout() {
  await destroySession();
  redirect("/");
}
