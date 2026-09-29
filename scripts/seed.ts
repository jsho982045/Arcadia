import "./load-env";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, closeDb } from "../src/lib/db";
import { users, comments, issues, scores, games } from "../src/lib/db/schema";
import { createGame, createVersion, forkGame, openPullRequest, nextNumber, loadTreeFiles, getVersion } from "../src/lib/games";
import { newId } from "../src/lib/ids";

function readDir(dir: string, base = dir, out: Record<string, Buffer> = {}) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) readDir(p, base, out);
    else out[path.relative(base, p).split(path.sep).join("/")] = fs.readFileSync(p);
  }
  return out;
}

async function mkUser(username: string, displayName: string, password: string, extra: Partial<typeof users.$inferInsert> = {}) {
  const existing = await db.select().from(users).where(eq(users.username, username));
  if (existing.length) return existing[0];
  const [u] = await db
    .insert(users)
    .values({ id: newId(), username, displayName, email: `${username}@example.com`, passwordHash: await bcrypt.hash(password, 10), ...extra })
    .returning();
  return u;
}

const SEED_GAMES = ["phase-runner", "orbit-survivors", "ghost-lap", "chain-bloom", "brick-blitz", "neon-serpent", "tile-fusion", "sky-hopper", "neon-drift", "gem-swap"];

/** Existing installs: publish any seed games that were added after the first seed. */
async function topUp(team: typeof users.$inferSelect) {
  const have = await db.select({ title: games.title }).from(games).where(eq(games.ownerId, team.id));
  const titles = new Set(have.map((g) => g.title));
  for (const slug of SEED_GAMES) {
    const files = readDir(path.join("seed-games", slug));
    const title = JSON.parse(files["arcadia.json"].toString("utf8")).title;
    if (titles.has(title)) continue;
    const g = await createGame({ owner: team, files, isSeed: true, publishNow: true });
    console.log("Added", g.title);
  }
}

async function main() {
  const already = await db.select().from(users).where(eq(users.username, "arcadia"));
  if (already.length) {
    await topUp(already[0]);
    console.log("Already seeded. Delete .data/ to start fresh.");
    return closeDb();
  }
  const adminPw = process.env.SEED_ADMIN_PASSWORD || "arcadia-admin";
  const team = await mkUser("arcadia", "Arcadia Team", adminPw, { isAdmin: true, trusted: true, bio: "The team behind Arcadia. We made the first few games; the rest is up to you." });
  const pat = await mkUser("pixelpat", "Pixel Pat", "password123", { bio: "I fix bugs in other people's games for fun." });
  const maya = await mkUser("mayaplays", "Maya", "password123", { plan: "pro", subscriptionStatus: "trialing", planInterval: "year", bio: "Puzzle games forever." });

  const order = SEED_GAMES;
  const made: Record<string, Awaited<ReturnType<typeof createGame>>> = {};
  for (const slug of order) {
    const files = readDir(path.join("seed-games", slug));
    made[slug] = await createGame({ owner: team, files, isSeed: true, publishNow: true });
    console.log("Published", made[slug].title);
  }

  // A realistic pull request: Pat forks Brick Blitz and adds a pause key.
  const fork = await forkGame(made["brick-blitz"], pat);
  const v = await getVersion(fork.currentVersionId);
  const files = await loadTreeFiles(v!.tree);
  let js = files["game.js"].toString("utf8");
  js = js.replace(
    `    keys[e.key] = true;\n`,
    `    keys[e.key] = true;\n    if (e.key === "p" || e.key === "Escape") { paused = !paused; return; }\n`,
  );
  js = js.replace(
    `    if (state === "over") center("GAME OVER"`,
    `    if (paused && state !== "title") center("PAUSED", "Press P to resume");\n    if (state === "over") center("GAME OVER"`,
  );
  files["game.js"] = Buffer.from(js);
  await createVersion({ gameId: fork.id, authorId: pat.id, message: "Add pause with P / Escape", files, parentVersionId: v!.id });
  const forkNow = (await db.select().from(games).where(eq(games.id, fork.id)))[0];

  // An issue first, so the PR can reference it.
  const issueNo = await nextNumber(made["brick-blitz"].id);
  await db.insert(issues).values({ id: newId(), gameId: made["brick-blitz"].id, number: issueNo, authorId: maya.id, kind: "idea", title: "Let me pause the game", body: "I keep losing lives when I tab away for a second. A pause key would be great.", votes: 3 });
  const { pr } = await openPullRequest(forkNow, pat, "Add a pause key (P / Esc)", `Pressing P or Escape now pauses and resumes the game, with a PAUSED overlay.\n\nFixes #${issueNo}`);
  await db.insert(comments).values({ id: newId(), targetType: "pr", targetId: pr.id, authorId: maya.id, body: "Tried the preview, works nicely on my laptop!" });

  const n2 = await nextNumber(made["neon-serpent"].id);
  await db.insert(issues).values({ id: newId(), gameId: made["neon-serpent"].id, number: n2, authorId: pat.id, kind: "idea", title: "Wrap-around walls mode", body: "A mode where the snake comes out the other side instead of dying.", votes: 5 });
  const n3 = await nextNumber(made["gem-swap"].id);
  await db.insert(issues).values({ id: newId(), gameId: made["gem-swap"].id, number: n3, authorId: maya.id, kind: "bug", title: "Hint pulse is hard to see on purple gems", body: "The idle hint animation barely shows on the purple hexagons.", votes: 1 });

  for (const [slug, who, body] of [
    ["tile-fusion", maya, "Finally a 2048 that remembers my game. Got to 1024!"],
    ["neon-drift", pat, "The near-miss bonus makes this so tense. Love it."],
    ["sky-hopper", maya, "Double jump feels great. Could use a pause button too."],
  ] as const) {
    await db.insert(comments).values({ id: newId(), targetType: "game", targetId: made[slug].id, authorId: who.id, body });
  }
  for (const [slug, who, s] of [
    ["brick-blitz", pat, 4120], ["brick-blitz", maya, 2650], ["neon-serpent", maya, 380], ["tile-fusion", maya, 12840],
    ["neon-drift", pat, 2210], ["sky-hopper", pat, 1575], ["gem-swap", maya, 3900],
  ] as const) {
    await db.insert(scores).values({ id: newId(), gameId: made[slug].id, userId: who.id, score: s });
  }

  console.log(`\nSeeded. Sign in as:\n  arcadia / ${adminPw}   (admin)\n  pixelpat / password123\n  mayaplays / password123  (Pro)\n`);
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
