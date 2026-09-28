import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { config, stripeEnabled } from "@/lib/config";
import { createSession } from "@/lib/auth";
import { applySubscription, stripe } from "@/lib/stripe";

/** Stripe sends the customer here after checkout. We confirm the subscription with Stripe (never trust the URL), then sign them in. */
export async function GET(req: Request) {
  const fail = (m: string) => NextResponse.redirect(`${config.appOrigin}/login?error=${encodeURIComponent(m)}`);
  const id = new URL(req.url).searchParams.get("session_id");
  if (!id || !stripeEnabled()) return fail("Could not confirm your subscription.");
  try {
    const session = await stripe().checkout.sessions.retrieve(id, { expand: ["subscription"] });
    const sub = session.subscription;
    if (!sub || typeof sub === "string" || !["active", "trialing"].includes(sub.status)) return fail("Your subscription isn't active yet. Try signing in again in a moment.");
    await applySubscription(sub);
    const userId = session.client_reference_id;
    const [u] = userId ? await db.select().from(users).where(eq(users.id, userId)) : [];
    if (!u || u.banned) return fail("Could not find your account.");
    await createSession(u.id);
    return NextResponse.redirect(`${config.appOrigin}/?welcome=1`);
  } catch (e) {
    console.error("checkout complete failed", e);
    return fail("Could not confirm your subscription.");
  }
}
