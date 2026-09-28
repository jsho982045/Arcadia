import "./load-env";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { db, closeDb } from "../src/lib/db";

async function main() {
  const migrationsFolder = "./drizzle";
  if (process.env.DATABASE_URL) {
    await migratePg(db as never, { migrationsFolder });
  } else {
    await migratePglite(db, { migrationsFolder });
  }
  console.log("Database migrated.");
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
