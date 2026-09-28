// Loads .env for standalone scripts (Next.js loads it on its own).
import fs from "node:fs";
for (const f of [".env.local", ".env"]) {
  if (fs.existsSync(f)) {
    try {
      process.loadEnvFile(f);
    } catch {
      /* older Node: ignore */
    }
  }
}
