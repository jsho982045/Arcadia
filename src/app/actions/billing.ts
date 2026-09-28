"use server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { devBillingAllowed, parseInterval, stripeEnabled } from "@/lib/config";
import { createCheckout, createPortal } from "@/lib/stripe";

export async function startCheckout(form?: FormData) {
  const user = await requireUser("/pro");
  if (!stripeEnabled()) {
    // Dev mode: no Stripe keys configured, so flip the plan directly for testing.
    if (!devBillingAllowed()) redirect("/pro?error=Payments+are+not+configured+yet");
    await db.update(users).set({ plan: "pro" }).where(eq(users.id, user.id));
    redirect("/pro?success=1");
  }
  redirect(await createCheckout(user, parseInterval(form?.get("interval"))));
}

export async function manageBilling() {
  const user = await requireUser("/pro");
  if (!stripeEnabled()) {
    if (!devBillingAllowed()) redirect("/pro");
    await db.update(users).set({ plan: "free" }).where(eq(users.id, user.id));
    redirect("/pro?cancelled=1");
  }
  redirect(await createPortal(user));
}
