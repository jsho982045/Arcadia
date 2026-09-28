import "server-only";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { config, stripeEnabled } from "./config";
import { db } from "./db";
import { users, type User } from "./db/schema";

let client: Stripe | null = null;
export function stripe() {
  if (!stripeEnabled()) throw new Error("Stripe is not configured");
  return (client ??= new Stripe(config.stripeSecretKey));
}

export async function createCheckout(user: User) {
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
    line_items: [{ price: config.stripePriceId, quantity: 1 }],
    success_url: `${config.appOrigin}/pro?success=1`,
    cancel_url: `${config.appOrigin}/pro`,
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

/** Keep users.plan in sync with the subscription's status. */
export async function applySubscription(sub: Stripe.Subscription) {
  const active = ["active", "trialing", "past_due"].includes(sub.status);
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  await db
    .update(users)
    .set({ plan: active ? "pro" : "free", stripeSubscriptionId: sub.id })
    .where(eq(users.stripeCustomerId, customer));
}
