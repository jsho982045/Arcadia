"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { games, reports, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";

/** After this many approved games a creator publishes without review. */
const TRUST_AFTER = 3;

export async function approveGame(form: FormData) {
  await requireAdmin();
  const id = String(form.get("gameId"));
  const [g] = await db.update(games).set({ status: "published", publishedAt: new Date(), reviewNote: null }).where(eq(games.id, id)).returning();
  if (g) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(games).where(and(eq(games.ownerId, g.ownerId), eq(games.status, "published")));
    if (Number(n) >= TRUST_AFTER) await db.update(users).set({ trusted: true }).where(eq(users.id, g.ownerId));
  }
  revalidatePath("/admin");
  redirect("/admin");
}

export async function rejectGame(form: FormData) {
  await requireAdmin();
  await db
    .update(games)
    .set({ status: "rejected", reviewNote: String(form.get("note") || "Doesn't meet the guidelines.").slice(0, 500) })
    .where(eq(games.id, String(form.get("gameId"))));
  redirect("/admin");
}

export async function resolveReport(form: FormData) {
  await requireAdmin();
  await db.update(reports).set({ status: "resolved" }).where(eq(reports.id, String(form.get("reportId"))));
  redirect("/admin");
}

export async function banUser(form: FormData) {
  const admin = await requireAdmin();
  const username = String(form.get("username") || "").trim().toLowerCase();
  if (username && username !== admin.username) {
    const [u] = await db.update(users).set({ banned: true }).where(eq(users.username, username)).returning();
    if (u) await db.update(games).set({ status: "archived" }).where(and(eq(games.ownerId, u.id), eq(games.status, "published")));
  }
  redirect("/admin");
}
