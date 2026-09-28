import "server-only";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { config, priceIdFor, stripeEnabled, type Interval } from "./config";
import { db } from "./db";
import { users, type User } from "./db/schema";

let client: Stripe | null = null;
export function stripe() {
  if (!stripeEnabled()) throw new Error("Stripe is not configured");
  return (client ??= new Stripe(config.stripeSecretKey));
}

/** Start a subscription checkout. Every plan has a free trial. New accounts land on /api/stripe/complete, which signs them in. */
export async function createCheckout(user: User, interval: Interval, opts: { signIn?: boolean } = {}) {
  const s = stripe();
  let customer = user.stripeCustomerId;
  if (!customer) {
    const c = await s.customers.create({ email: user.email, metadata: { userId: user.id, username: user.username } });
    customer = c.id;
    await db.update(users).set({ stripeCustomerId: customer }).where(eq(users.id, user.id));
  }
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price: priceIdFor(interval), quantity: 1 }],
    subscription_data: { trial_period_days: config.trialDays, metadata: { userId: user.id } },
    payment_method_collection: "always",
    success_url: opts.signIn ? `${config.appOrigin}/api/stripe/complete?session_id={CHECKOUT_SESSION_ID}` : `${config.appOrigin}/pro?success=1`,
    cancel_url: opts.signIn ? `${config.appOrigin}/login?error=${encodeURIComponent("A subscription is required to sign in. Your free trial starts at checkout.")}` : `${config.appOrigin}/pro`,
    client_reference_id: user.id,
    allow_promotion_codes: true,
    automatic_tax: { enabled: process.env.STRIPE_AUTOMATIC_TAX === "true" },
  });
  return session.url!;
}

export async function createPortal(user: User) {
  const s = stripe();
  if (!user.stripeCustomerId) throw new Error("No Stripe customer");
  const p = await s.billingPortal.sessions.create({ customer: user.stripeCustomerId, return_url: `${config.appOrigin}/pro` });
  return p.url;
}

/** Keep the user's plan in sync with the subscription's status. */
export async function applySubscription(sub: Stripe.Subscription) {
  const active = ["active", "trialing", "past_due"].includes(sub.status);
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const interval = sub.items.data[0]?.price.recurring?.interval === "year" ? "year" : "month";
  await db
    .update(users)
    .set({
      plan: active ? "pro" : "free",
      stripeSubscriptionId: sub.id,
      planInterval: interval,
      subscriptionStatus: sub.status,
      trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    })
    .where(eq(users.stripeCustomerId, customer));
}
