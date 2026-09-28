import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cache } from "react";
import { db } from "./db";
import { sessions, users, type User } from "./db/schema";
import { sha256 } from "./storage";
import { newId } from "./ids";

const SESSION_COOKIE = "arcadia_session";
const ANON_COOKIE = "arcadia_anon";
const SESSION_DAYS = 30;

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 11);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(sessions).values({ id: sha256(token), userId, expiresAt });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Cached per request. */
export const getUser = cache(async (): Promise<User | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const user = rows[0]?.user ?? null;
  if (user?.banned) return null;
  return user;
});

export async function requireUser(next?: string): Promise<User> {
  const user = await getUser();
  if (!user) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/");
  return user;
}

/** Stable key for play-time tracking: the user id, or an anonymous cookie id for signed-out players. */
export async function getPlayerKey(): Promise<{ key: string; user: User | null }> {
  const user = await getUser();
  if (user) return { key: user.id, user };
  const jar = await cookies();
  let anon = jar.get(ANON_COOKIE)?.value;
  if (!anon || !/^[A-Za-z0-9_-]{10,40}$/.test(anon)) {
    anon = newId();
    jar.set(ANON_COOKIE, anon, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 365 * 86400 });
  }
  return { key: `anon:${anon}`, user: null };
}
