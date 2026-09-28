import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { config, stripeEnabled } from "@/lib/config";
import { applySubscription, stripe } from "@/lib/stripe";

/** Stripe webhook: point it at /api/stripe/webhook and send the customer.subscription.* and checkout.session.completed events. */
export async function POST(req: Request) {
  if (!stripeEnabled() || !config.stripeWebhookSecret) return NextResponse.json({ error: "Stripe not configured" }, { status: 400 });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing signature" }, { status: 400 });
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), sig, config.stripeWebhookSecret);
  } catch {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.subscription) {
        const sub = await stripe().subscriptions.retrieve(typeof s.subscription === "string" ? s.subscription : s.subscription.id);
        await applySubscription(sub);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await applySubscription(event.data.object as Stripe.Subscription);
      break;
  }
  return NextResponse.json({ received: true });
}
