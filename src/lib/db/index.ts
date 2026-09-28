import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

/**
 * Database client.
 * - DATABASE_URL set  -> real Postgres (production, or local Postgres).
 * - DATABASE_URL unset -> embedded Postgres (PGlite) stored in .data/pglite. Zero setup for local dev.
 * Both speak the same SQL, so the schema and queries are identical.
 */
export type Db = ReturnType<typeof drizzlePglite<typeof schema>>;

const g = globalThis as unknown as { __arcadiaDb?: Db; __arcadiaClose?: () => Promise<void> };

export function pgliteDir() {
  return path.resolve(process.env.PGLITE_DIR || ".data/pglite");
}

/** SSL for hosted Postgres over the internet; off for local and Railway's private network. DATABASE_SSL=true|false overrides. */
function wantsSsl(url: string) {
  if (process.env.DATABASE_SSL) return process.env.DATABASE_SSL === "true";
  return !/@(localhost|127\.0\.0\.1|[^/:]+\.railway\.internal)[:/]/.test(url);
}

function create(): Db {
  if (process.env.DATABASE_URL) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: wantsSsl(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
    });
    g.__arcadiaClose = () => pool.end();
    return drizzlePg(pool, { schema }) as unknown as Db;
  }
  const dir = pgliteDir();
  fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  g.__arcadiaClose = () => client.close();
  // PGlite is an embedded database: close it cleanly on Ctrl+C so its files aren't left half-written.
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.once(sig, () => {
      client.close().finally(() => process.exit(0));
    });
  }
  return drizzlePglite(client, { schema });
}

export const db: Db = g.__arcadiaDb ?? (g.__arcadiaDb = create());

export async function closeDb() {
  await g.__arcadiaClose?.();
}

export { schema };
