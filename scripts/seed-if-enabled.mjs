// Seeds the demo games on startup only when SEED_DEMO=true (safe to leave on: the seed skips if already done).
import { spawnSync } from "node:child_process";
if (process.env.SEED_DEMO === "true") {
  const r = spawnSync("npx", ["tsx", "scripts/seed.ts"], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
