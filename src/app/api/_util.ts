import { NextResponse } from "next/server";

/** JSON-only endpoints: browsers can't send application/json cross-site without CORS, which blocks CSRF. */
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  if (!req.headers.get("content-type")?.includes("application/json")) return null;
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return null;
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}

export const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });
