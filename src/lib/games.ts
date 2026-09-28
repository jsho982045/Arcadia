import JSZip from "jszip";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { games, issues, pullRequests, users, versions, comments, type Game, type Tree, type User, type CheckReport } from "./db/schema";
import { newId, slugify } from "./ids";
import { putTree, storeFiles, getBlob } from "./storage";
import { normalizePath, runChecks } from "./checks";
import { mergeTrees } from "./trees";
import { config, LICENSES } from "./config";

export class UserError extends Error {}

// ---------- Files & manifests ----------

export type Manifest = {
  title?: string;
  description?: string;
  instructions?: string;
  category?: string;
  tags?: string[];
  thumbnail?: string;
  orientation?: "landscape" | "portrait";
};

export function readManifest(files: Record<string, Buffer>): Manifest {
  const raw = files["arcadia.json"];
  if (!raw) return {};
  try {
    const m = JSON.parse(raw.toString("utf8"));
    return typeof m === "object" && m ? m : {};
  } catch {
    return {};
  }
}

/** Unzip an upload into a path -> contents map, rejecting anything unsafe. */
export async function extractZip(buf: Buffer): Promise<Record<string, Buffer>> {
  if (buf.length > config.maxUploadBytes) throw new UserError("Zip is larger than the upload limit.");
  const zip = await JSZip.loadAsync(buf);
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  if (entries.length > config.maxFiles) throw new UserError("Too many files in the zip.");
  const raw: Record<string, Buffer> = {};
  let total = 0;
  for (const e of entries) {
    const p = normalizePath(e.name);
    if (!p) continue; // skip hidden files, __MACOSX, traversal attempts
    const data = await e.async("nodebuffer");
    total += data.length;
    if (total > config.maxUploadBytes) throw new UserError("Unzipped game is larger than the upload limit (zip bomb protection).");
    raw[p] = data;
  }
  // If everything sits inside one top-level folder (common when zipping a folder), strip it.
  const keys = Object.keys(raw);
  if (!raw["index.html"] && keys.length) {
    const first = keys[0].split("/")[0];
    if (keys.every((k) => k.startsWith(first + "/")) && raw[`${first}/index.html`]) {
      const stripped: Record<string, Buffer> = {};
      for (const k of keys) stripped[k.slice(first.length + 1)] = raw[k];
      return stripped;
    }
  }
  return raw;
}

export async function loadTreeFiles(tree: Tree): Promise<Record<string, Buffer>> {
  const out: Record<string, Buffer> = {};
  for (const [p, f] of Object.entries(tree)) out[p] = await getBlob(f.h);
  return out;
}

// ---------- Lookups ----------

export async function getGameByPath(ownerName: string, slug: string) {
  const rows = await db
    .select({ game: games, owner: users })
    .from(games)
    .innerJoin(users, eq(users.id, games.ownerId))
    .where(and(eq(users.username, ownerName.toLowerCase()), eq(games.slug, slug)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getGameWithOwner(id: string) {
  const rows = await db.select({ game: games, owner: users }).from(games).innerJoin(users, eq(users.id, games.ownerId)).where(eq(games.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getVersion(id: string | null | undefined) {
  if (!id) return null;
  const rows = await db.select().from(versions).where(eq(versions.id, id)).limit(1);
  return rows[0] ?? null;
}

export function gameUrl(ownerName: string, slug: string) {
  return `/g/${ownerName}/${slug}`;
}

export function canPlay(game: Game, viewer: User | null) {
  if (game.status === "published" || game.status === "fork") return true;
  return !!viewer && (viewer.id === game.ownerId || viewer.isAdmin);
}

export function isForkable(game: Game) {
  return game.allowPrs && (LICENSES[game.license]?.forkable ?? true) && game.status !== "fork";
}

// ---------- Versions ----------

export async function createVersion(opts: {
  gameId: string;
  authorId: string;
  message: string;
  files?: Record<string, Buffer>;
  tree?: Tree;
  checks?: CheckReport;
  parentVersionId?: string | null;
  prId?: string | null;
}) {
  let tree = opts.tree;
  let checks = opts.checks;
  if (opts.files) {
    checks = runChecks(opts.files);
    tree = await storeFiles(opts.files);
  }
  if (!tree) throw new Error("createVersion needs files or a tree");
  if (!checks) checks = runChecks(await loadTreeFiles(tree));

  const id = newId();
  const [{ n }] = await db
    .select({ n: sql<number>`coalesce(max(${versions.number}), 0) + 1` })
    .from(versions)
    .where(eq(versions.gameId, opts.gameId));
  await putTree(id, tree); // play server reads this file
  const [v] = await db
    .insert(versions)
    .values({
      id,
      gameId: opts.gameId,
      number: Number(n),
      message: opts.message.slice(0, 500) || "Update",
      authorId: opts.authorId,
      parentVersionId: opts.parentVersionId ?? null,
      tree,
      checks,
      prId: opts.prId ?? null,
    })
    .returning();
  if (checks.status !== "fail") {
    await db.update(games).set({ currentVersionId: id, updatedAt: new Date() }).where(eq(games.id, opts.gameId));
  }
  return v;
}

// ---------- Games ----------

async function uniqueSlug(ownerId: string, base: string) {
  let slug = slugify(base);
  for (let i = 2; i < 100; i++) {
    const exists = await db.select({ id: games.id }).from(games).where(and(eq(games.ownerId, ownerId), eq(games.slug, slug))).limit(1);
    if (!exists.length) return slug;
    slug = `${slugify(base).slice(0, 44)}-${i}`;
  }
  return `${slugify(base).slice(0, 36)}-${newId().slice(0, 6)}`;
}

export async function createGame(opts: {
  owner: User;
  files: Record<string, Buffer>;
  title?: string;
  description?: string;
  instructions?: string;
  category?: string;
  tags?: string[];
  license?: string;
  isSeed?: boolean;
  publishNow?: boolean;
}) {
  const manifest = readManifest(opts.files);
  const title = (opts.title || manifest.title || "Untitled game").slice(0, 80);
  const checks = runChecks(opts.files);
  if (checks.status === "fail") {
    throw new UserError("The game failed automatic checks: " + checks.items.filter((i) => i.level === "fail").map((i) => i.message).join(" "));
  }
  const id = newId();
  const autoPublish = opts.publishNow || opts.owner.trusted || opts.owner.isAdmin;
  const thumb = manifest.thumbnail && opts.files[manifest.thumbnail] ? manifest.thumbnail : null;
  await db.insert(games).values({
    id,
    ownerId: opts.owner.id,
    slug: await uniqueSlug(opts.owner.id, title),
    title,
    description: (opts.description ?? manifest.description ?? "").slice(0, 2000),
    instructions: (opts.instructions ?? manifest.instructions ?? "").slice(0, 1000),
    category: opts.category || manifest.category || "arcade",
    tags: (opts.tags ?? manifest.tags ?? []).slice(0, 8),
    license: opts.license && LICENSES[opts.license] ? opts.license : "arcadia-remix",
    status: autoPublish ? "published" : "review",
    publishedAt: autoPublish ? new Date() : null,
    thumbnail: thumb,
    orientation: manifest.orientation === "portrait" ? "portrait" : "landscape",
    isSeed: !!opts.isSeed,
  });
  await createVersion({ gameId: id, authorId: opts.owner.id, message: "First release", files: opts.files, checks });
  const [g] = await db.select().from(games).where(eq(games.id, id));
  return g;
}

/** Copy a game into the user's account so they can change it and open a pull request. */
export async function forkGame(source: Game, user: User) {
  if (!isForkable(source)) throw new UserError("This game doesn't accept forks.");
  if (source.ownerId === user.id) throw new UserError("You can edit your own game directly.");
  const existing = await db.select().from(games).where(and(eq(games.forkOfId, source.id), eq(games.ownerId, user.id))).limit(1);
  if (existing.length) return existing[0];
  const base = await getVersion(source.currentVersionId);
  if (!base) throw new UserError("This game has no version to fork.");
  const id = newId();
  await db.insert(games).values({
    id,
    ownerId: user.id,
    slug: await uniqueSlug(user.id, source.slug),
    title: source.title,
    description: source.description,
    instructions: source.instructions,
    category: source.category,
    tags: source.tags,
    license: source.license,
    status: "fork",
    thumbnail: source.thumbnail,
    orientation: source.orientation,
    allowPrs: false,
    forkOfId: source.id,
    forkBaseVersionId: base.id,
  });
  await createVersion({ gameId: id, authorId: user.id, message: `Forked from v${base.number}`, tree: base.tree, checks: base.checks, parentVersionId: base.id });
  const [g] = await db.select().from(games).where(eq(games.id, id));
  return g;
}

/** Bring a fork up to date with its parent. Files changed on both sides keep the fork's copy. */
export async function syncFork(fork: Game, user: User) {
  if (!fork.forkOfId || fork.ownerId !== user.id) throw new UserError("Only the fork's owner can sync it.");
  const parent = (await db.select().from(games).where(eq(games.id, fork.forkOfId)))[0];
  const [base, ours, theirs] = await Promise.all([getVersion(fork.forkBaseVersionId), getVersion(parent?.currentVersionId), getVersion(fork.currentVersionId)]);
  if (!parent || !base || !ours || !theirs) throw new UserError("Can't sync this fork.");
  if (ours.id === base.id) return { changed: false, kept: [] as string[] };
  const { tree, conflicts } = mergeTrees(base.tree, ours.tree, theirs.tree);
  for (const p of conflicts) {
    if (theirs.tree[p]) tree[p] = theirs.tree[p];
  }
  await createVersion({ gameId: fork.id, authorId: user.id, message: `Synced with ${parent.title} v${ours.number}`, tree, parentVersionId: theirs.id });
  await db.update(games).set({ forkBaseVersionId: ours.id }).where(eq(games.id, fork.id));
  return { changed: true, kept: conflicts };
}

export async function nextNumber(gameId: string) {
  const [row] = await db
    .update(games)
    .set({ nextNumber: sql`${games.nextNumber} + 1` })
    .where(eq(games.id, gameId))
    .returning({ n: games.nextNumber });
  return row.n - 1;
}

// ---------- Pull requests ----------

export async function openPullRequest(fork: Game, user: User, title: string, body: string) {
  if (!fork.forkOfId || fork.ownerId !== user.id) throw new UserError("Open pull requests from your own fork.");
  const target = (await db.select().from(games).where(eq(games.id, fork.forkOfId)))[0];
  if (!target || !isForkable(target)) throw new UserError("That game isn't accepting pull requests.");
  const open = await db
    .select()
    .from(pullRequests)
    .where(and(eq(pullRequests.sourceGameId, fork.id), eq(pullRequests.status, "open")))
    .limit(1);
  if (open.length) throw new UserError(`You already have an open pull request (#${open[0].number}) from this fork.`);
  if (fork.currentVersionId === fork.forkBaseVersionId) throw new UserError("Your fork has no changes yet.");
  const head = await getVersion(fork.currentVersionId);
  const base = await getVersion(fork.forkBaseVersionId);
  if (!head || !base) throw new UserError("Fork is missing versions.");
  if (JSON.stringify(head.tree) === JSON.stringify(base.tree)) throw new UserError("Your fork has no changes compared to the original.");
  const number = await nextNumber(target.id);
  const [pr] = await db
    .insert(pullRequests)
    .values({
      id: newId(),
      number,
      targetGameId: target.id,
      sourceGameId: fork.id,
      authorId: user.id,
      title: title.slice(0, 140) || "Suggested changes",
      body: body.slice(0, 10000),
      baseVersionId: base.id,
      headVersionId: head.id,
    })
    .returning();
  return { pr, target };
}

/** Current head/base for a PR. While open it follows the fork's latest version. */
export async function prVersions(pr: typeof pullRequests.$inferSelect) {
  let headId = pr.headVersionId;
  let baseId = pr.baseVersionId;
  if (pr.status === "open") {
    const fork = (await db.select().from(games).where(eq(games.id, pr.sourceGameId)))[0];
    if (fork?.currentVersionId) headId = fork.currentVersionId;
    if (fork?.forkBaseVersionId) baseId = fork.forkBaseVersionId;
  }
  const [head, base] = await Promise.all([getVersion(headId), getVersion(baseId)]);
  return { head, base };
}

export async function canMaintain(game: Game, user: User | null) {
  return !!user && (user.id === game.ownerId || user.isAdmin);
}

export async function previewMerge(pr: typeof pullRequests.$inferSelect) {
  const target = (await db.select().from(games).where(eq(games.id, pr.targetGameId)))[0];
  const { head, base } = await prVersions(pr);
  const current = await getVersion(target.currentVersionId);
  if (!head || !base || !current) return { ok: false as const, conflicts: [] as string[], reason: "Missing versions." };
  const { tree, conflicts } = mergeTrees(base.tree, current.tree, head.tree);
  if (head.checks.status === "fail") return { ok: false as const, conflicts, reason: "Automatic checks failed on this pull request." };
  return { ok: conflicts.length === 0, conflicts, tree, head, current, reason: conflicts.length ? "Conflicting changes." : "" };
}

export async function mergePullRequest(prId: string, user: User, points: number) {
  const pr = (await db.select().from(pullRequests).where(eq(pullRequests.id, prId)))[0];
  if (!pr || pr.status !== "open") throw new UserError("This pull request isn't open.");
  const target = (await db.select().from(games).where(eq(games.id, pr.targetGameId)))[0];
  if (!(await canMaintain(target, user))) throw new UserError("Only the game's owner can merge.");
  const m = await previewMerge(pr);
  if (!m.ok || !m.tree || !m.head || !m.current) throw new UserError(m.reason || "Can't merge.");
  const v = await createVersion({
    gameId: target.id,
    authorId: pr.authorId,
    message: `Merge #${pr.number}: ${pr.title}`,
    tree: m.tree,
    parentVersionId: m.current.id,
    prId: pr.id,
  });
  const pts = [1, 3, 5].includes(points) ? points : 1;
  await db
    .update(pullRequests)
    .set({ status: "merged", mergedVersionId: v.id, mergedById: user.id, headVersionId: m.head.id, points: pts, closedAt: new Date(), updatedAt: new Date() })
    .where(eq(pullRequests.id, pr.id));
  await db.insert(comments).values({ id: newId(), targetType: "pr", targetId: pr.id, authorId: user.id, body: `merged this as v${v.number} (${pts} contributor point${pts > 1 ? "s" : ""})`, kind: "event" });

  // "Fixes #12" in the PR closes that issue.
  const refs = [...`${pr.title}\n${pr.body}`.matchAll(/\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s+#(\d+)/gi)].map((x) => Number(x[1]));
  for (const n of refs) {
    await db
      .update(issues)
      .set({ status: "closed", closedByPrId: pr.id })
      .where(and(eq(issues.gameId, target.id), eq(issues.number, n)));
  }
  // The fork is now based on the merged version.
  await db.update(games).set({ forkBaseVersionId: v.id }).where(eq(games.id, pr.sourceGameId));
  return v;
}

/** Roll back by creating a new version with an old version's files (history is never rewritten). */
export async function revertTo(game: Game, versionId: string, user: User) {
  if (!(await canMaintain(game, user))) throw new UserError("Only the owner can roll back.");
  const old = await getVersion(versionId);
  if (!old || old.gameId !== game.id) throw new UserError("Unknown version.");
  if (old.checks.status === "fail") throw new UserError("That version failed checks.");
  return createVersion({ gameId: game.id, authorId: user.id, message: `Rolled back to v${old.number}`, tree: old.tree, checks: old.checks, parentVersionId: game.currentVersionId });
}

export async function recentVersions(gameId: string, limit = 50) {
  return db
    .select({ v: versions, author: users })
    .from(versions)
    .innerJoin(users, eq(users.id, versions.authorId))
    .where(eq(versions.gameId, gameId))
    .orderBy(desc(versions.number))
    .limit(limit);
}

/** Contributors = authors of merged PRs, with their points. */
export async function contributorsFor(gameId: string) {
  return db
    .select({
      user: users,
      points: sql<number>`sum(${pullRequests.points})::int`,
      merged: sql<number>`count(*)::int`,
    })
    .from(pullRequests)
    .innerJoin(users, eq(users.id, pullRequests.authorId))
    .where(and(eq(pullRequests.targetGameId, gameId), eq(pullRequests.status, "merged")))
    .groupBy(users.id)
    .orderBy(desc(sql`sum(${pullRequests.points})`));
}
