"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { comments, favorites, games, issueVotes, issues, pullRequests, ratings, reports, users, type Game } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { newId } from "@/lib/ids";
import {
  UserError,
  createGame,
  createVersion,
  extractZip,
  forkGame,
  getGameWithOwner,
  getVersion,
  loadTreeFiles,
  mergePullRequest,
  nextNumber,
  openPullRequest,
  revertTo,
  syncFork,
} from "@/lib/games";
import { CATEGORIES, LICENSES } from "@/lib/config";
import { normalizePath } from "@/lib/checks";
import fs from "node:fs";
import path from "node:path";

const str = (f: FormData, k: string, max = 10000) => String(f.get(k) ?? "").trim().slice(0, max);

async function gameOr404(id: string) {
  const row = await getGameWithOwner(id);
  if (!row) throw new UserError("Game not found.");
  return row;
}
const urlOf = (owner: { username: string }, g: Game) => `/g/${owner.username}/${g.slug}`;

function fail(where: string, e: unknown): never {
  if (e instanceof UserError) redirect(`${where}${where.includes("?") ? "&" : "?"}error=${encodeURIComponent(e.message)}`);
  throw e;
}

// ---------- Publishing ----------

export async function publishGame(form: FormData) {
  const user = await requireUser("/new");
  let dest = "/new";
  try {
    const source = str(form, "source");
    let files: Record<string, Buffer>;
    if (source === "template") {
      files = readTemplate("starter");
    } else {
      const file = form.get("zip");
      if (!(file instanceof File) || file.size === 0) throw new UserError("Choose a .zip file with your game (it needs an index.html).");
      files = await extractZip(Buffer.from(await file.arrayBuffer()));
    }
    const category = CATEGORIES.some((c) => c.id === str(form, "category")) ? str(form, "category") : undefined;
    const tags = str(form, "tags", 200).split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8);
    const g = await createGame({
      owner: user,
      files,
      title: str(form, "title", 80) || undefined,
      description: str(form, "description", 2000) || undefined,
      instructions: str(form, "instructions", 1000) || undefined,
      category,
      tags: tags.length ? tags : undefined,
      license: str(form, "license"),
    });
    dest = `/g/${user.username}/${g.slug}?published=1`;
  } catch (e) {
    fail("/new", e);
  }
  redirect(dest);
}

function readTemplate(name: string) {
  const dir = path.join(process.cwd(), "templates", name);
  const out: Record<string, Buffer> = {};
  for (const f of fs.readdirSync(dir)) out[f] = fs.readFileSync(path.join(dir, f));
  return out;
}

/** Upload a new version of your own game as a zip. */
export async function uploadVersion(form: FormData) {
  const user = await requireUser();
  const { game, owner } = await gameOr404(str(form, "gameId"));
  const back = `${urlOf(owner, game)}/releases`;
  try {
    if (game.ownerId !== user.id) throw new UserError("Only the owner can upload new versions.");
    const file = form.get("zip");
    if (!(file instanceof File) || file.size === 0) throw new UserError("Choose a .zip file.");
    const files = await extractZip(Buffer.from(await file.arrayBuffer()));
    const v = await createVersion({ gameId: game.id, authorId: user.id, message: str(form, "message", 300) || "New version", files, parentVersionId: game.currentVersionId });
    if (v.checks.status === "fail") throw new UserError("That upload failed the automatic checks, so it wasn't released: " + v.checks.items.filter((i) => i.level === "fail").map((i) => i.message).join(" "));
  } catch (e) {
    fail(back, e);
  }
  revalidatePath(back);
  redirect(back);
}

/** Save from the in-browser editor. Returns a result instead of redirecting (called from a client component). */
export async function commitFiles(input: { gameId: string; message: string; changes: { path: string; content: string | null; base64?: boolean }[] }) {
  const user = await requireUser();
  const row = await getGameWithOwner(input.gameId);
  if (!row) return { ok: false as const, error: "Game not found." };
  const { game } = row;
  if (game.ownerId !== user.id) return { ok: false as const, error: "You can only edit your own games and forks. Fork this game first." };
  const current = await getVersion(game.currentVersionId);
  if (!current) return { ok: false as const, error: "Game has no version." };
  const files = await loadTreeFiles(current.tree);
  for (const ch of input.changes.slice(0, 200)) {
    const p = normalizePath(ch.path);
    if (!p) return { ok: false as const, error: `Invalid file name: ${ch.path}` };
    if (ch.content === null) delete files[p];
    else files[p] = ch.base64 ? Buffer.from(ch.content, "base64") : Buffer.from(ch.content, "utf8");
  }
  const v = await createVersion({ gameId: game.id, authorId: user.id, message: input.message.slice(0, 300) || "Update files", files, parentVersionId: current.id });
  if (v.checks.status === "fail") {
    return { ok: false as const, error: "Checks failed: " + v.checks.items.filter((i) => i.level === "fail").map((i) => i.message).join(" "), versionId: v.id };
  }
  return { ok: true as const, versionId: v.id, number: v.number, checks: v.checks };
}

// ---------- Social ----------

export async function rateGame(form: FormData) {
  const user = await requireUser();
  const { game, owner } = await gameOr404(str(form, "gameId"));
  const stars = Math.max(1, Math.min(5, Number(form.get("stars")) | 0));
  const [prev] = await db.select().from(ratings).where(and(eq(ratings.gameId, game.id), eq(ratings.userId, user.id)));
  if (prev) {
    await db.update(ratings).set({ stars }).where(and(eq(ratings.gameId, game.id), eq(ratings.userId, user.id)));
    await db.update(games).set({ ratingSum: sql`${games.ratingSum} + ${stars - prev.stars}` }).where(eq(games.id, game.id));
  } else {
    await db.insert(ratings).values({ gameId: game.id, userId: user.id, stars });
    await db.update(games).set({ ratingSum: sql`${games.ratingSum} + ${stars}`, ratingCount: sql`${games.ratingCount} + 1` }).where(eq(games.id, game.id));
  }
  revalidatePath(urlOf(owner, game));
}

export async function toggleFavorite(form: FormData) {
  const user = await requireUser();
  const { game, owner } = await gameOr404(str(form, "gameId"));
  const del = await db.delete(favorites).where(and(eq(favorites.gameId, game.id), eq(favorites.userId, user.id))).returning();
  if (!del.length) await db.insert(favorites).values({ gameId: game.id, userId: user.id });
  revalidatePath(urlOf(owner, game));
}

export async function addComment(form: FormData) {
  const user = await requireUser();
  const targetType = str(form, "targetType");
  const targetId = str(form, "targetId");
  const back = str(form, "back", 300);
  const body = str(form, "body", 5000);
  if (!["game", "issue", "pr"].includes(targetType) || !body) redirect(back || "/");
  await db.insert(comments).values({ id: newId(), targetType, targetId, authorId: user.id, body });
  revalidatePath(back);
  redirect(back.startsWith("/") ? back : "/");
}

export async function report(form: FormData) {
  const user = await requireUser();
  await db.insert(reports).values({ id: newId(), targetType: str(form, "targetType", 20), targetId: str(form, "targetId", 40), reporterId: user.id, reason: str(form, "reason", 1000) || "No reason given" });
  const back = str(form, "back", 300);
  redirect(`${back.startsWith("/") ? back : "/"}${back.includes("?") ? "&" : "?"}reported=1`);
}

// ---------- Forks & pull requests ----------

export async function forkAction(form: FormData) {
  const user = await requireUser();
  const { game, owner } = await gameOr404(str(form, "gameId"));
  let dest = "";
  try {
    const fork = await forkGame(game, user);
    dest = `/g/${user.username}/${fork.slug}/edit`;
  } catch (e) {
    fail(urlOf(owner, game), e);
  }
  redirect(dest);
}

export async function syncForkAction(form: FormData) {
  const user = await requireUser();
  const { game, owner } = await gameOr404(str(form, "gameId"));
  let msg = "";
  try {
    const r = await syncFork(game, user);
    msg = !r.changed ? "Already up to date." : r.kept.length ? `Synced. Kept your version of: ${r.kept.join(", ")}` : "Synced with the latest version.";
  } catch (e) {
    fail(urlOf(owner, game), e);
  }
  redirect(`${urlOf(owner, game)}/releases?notice=${encodeURIComponent(msg)}`);
}

export async function openPrAction(form: FormData) {
  const user = await requireUser();
  const { game: fork, owner } = await gameOr404(str(form, "gameId"));
  let dest = "";
  try {
    const { pr, target } = await openPullRequest(fork, user, str(form, "title", 140), str(form, "body", 10000));
    const [tOwner] = await db.select().from(users).where(eq(users.id, target.ownerId));
    dest = `/g/${tOwner.username}/${target.slug}/pulls/${pr.number}`;
  } catch (e) {
    fail(`${urlOf(owner, fork)}/pulls/new`, e);
  }
  redirect(dest);
}

export async function mergePrAction(form: FormData) {
  const user = await requireUser();
  const prId = str(form, "prId");
  const [pr] = await db.select().from(pullRequests).where(eq(pullRequests.id, prId));
  if (!pr) redirect("/");
  const { game, owner } = await gameOr404(pr.targetGameId);
  const back = `${urlOf(owner, game)}/pulls/${pr.number}`;
  try {
    await mergePullRequest(prId, user, Number(form.get("points")) || 1);
  } catch (e) {
    fail(back, e);
  }
  revalidatePath(back);
  redirect(back);
}

export async function setPrStatus(form: FormData) {
  const user = await requireUser();
  const [pr] = await db.select().from(pullRequests).where(eq(pullRequests.id, str(form, "prId")));
  if (!pr) redirect("/");
  const { game, owner } = await gameOr404(pr.targetGameId);
  const back = `${urlOf(owner, game)}/pulls/${pr.number}`;
  const status = str(form, "status");
  const allowed = user.id === game.ownerId || user.id === pr.authorId || user.isAdmin;
  if (allowed && pr.status !== "merged" && (status === "closed" || status === "open")) {
    await db.update(pullRequests).set({ status, closedAt: status === "closed" ? new Date() : null, updatedAt: new Date() }).where(eq(pullRequests.id, pr.id));
    await db.insert(comments).values({ id: newId(), targetType: "pr", targetId: pr.id, authorId: user.id, body: status === "closed" ? "closed this pull request" : "reopened this pull request", kind: "event" });
  }
  revalidatePath(back);
  redirect(back);
}

// ---------- Issues ----------

export async function createIssue(form: FormData) {
  const user = await requireUser();
  const { game, owner } = await gameOr404(str(form, "gameId"));
  const title = str(form, "title", 140);
  if (!title) redirect(`${urlOf(owner, game)}/issues/new?error=${encodeURIComponent("Give your issue a title.")}`);
  const number = await nextNumber(game.id);
  await db.insert(issues).values({ id: newId(), gameId: game.id, number, authorId: user.id, kind: str(form, "kind") === "idea" ? "idea" : "bug", title, body: str(form, "body", 10000) });
  redirect(`${urlOf(owner, game)}/issues/${number}`);
}

export async function setIssueStatus(form: FormData) {
  const user = await requireUser();
  const [issue] = await db.select().from(issues).where(eq(issues.id, str(form, "issueId")));
  if (!issue) redirect("/");
  const { game, owner } = await gameOr404(issue.gameId);
  const back = `${urlOf(owner, game)}/issues/${issue.number}`;
  const status = str(form, "status") === "closed" ? "closed" : "open";
  if (user.id === game.ownerId || user.id === issue.authorId || user.isAdmin) {
    await db.update(issues).set({ status }).where(eq(issues.id, issue.id));
    await db.insert(comments).values({ id: newId(), targetType: "issue", targetId: issue.id, authorId: user.id, body: status === "closed" ? "closed this issue" : "reopened this issue", kind: "event" });
  }
  revalidatePath(back);
  redirect(back);
}

export async function voteIssue(form: FormData) {
  const user = await requireUser();
  const issueId = str(form, "issueId");
  const removed = await db.delete(issueVotes).where(and(eq(issueVotes.issueId, issueId), eq(issueVotes.userId, user.id))).returning();
  if (removed.length) await db.update(issues).set({ votes: sql`${issues.votes} - 1` }).where(eq(issues.id, issueId));
  else {
    await db.insert(issueVotes).values({ issueId, userId: user.id });
    await db.update(issues).set({ votes: sql`${issues.votes} + 1` }).where(eq(issues.id, issueId));
  }
  const back = str(form, "back", 300);
  revalidatePath(back);
  redirect(back.startsWith("/") ? back : "/");
}

// ---------- Owner settings ----------

export async function updateSettings(form: FormData) {
  const user = await requireUser();
  const { game, owner } = await gameOr404(str(form, "gameId"));
  const back = `${urlOf(owner, game)}/settings`;
  if (game.ownerId !== user.id && !user.isAdmin) redirect(back);
  const license = LICENSES[str(form, "license")] ? str(form, "license") : game.license;
  const category = CATEGORIES.some((c) => c.id === str(form, "category")) ? str(form, "category") : game.category;
  await db
    .update(games)
    .set({
      title: str(form, "title", 80) || game.title,
      description: str(form, "description", 2000),
      instructions: str(form, "instructions", 1000),
      category,
      tags: str(form, "tags", 200).split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8),
      license,
      allowPrs: form.get("allowPrs") === "on" && LICENSES[license].forkable,
      contributorShare: Math.max(0, Math.min(50, Number(form.get("contributorShare")) | 0)),
      orientation: str(form, "orientation") === "portrait" ? "portrait" : "landscape",
      updatedAt: new Date(),
    })
    .where(eq(games.id, game.id));
  redirect(`${back}?saved=1`);
}

export async function archiveGame(form: FormData) {
  const user = await requireUser();
  const { game, owner } = await gameOr404(str(form, "gameId"));
  if (game.ownerId !== user.id && !user.isAdmin) redirect(urlOf(owner, game));
  const next = game.status === "archived" ? "published" : "archived";
  await db.update(games).set({ status: next }).where(eq(games.id, game.id));
  redirect(next === "archived" ? `/u/${owner.username}` : urlOf(owner, game));
}

export async function revertAction(form: FormData) {
  const user = await requireUser();
  const { game, owner } = await gameOr404(str(form, "gameId"));
  const back = `${urlOf(owner, game)}/releases`;
  try {
    await revertTo(game, str(form, "versionId"), user);
  } catch (e) {
    fail(back, e);
  }
  redirect(`${back}?notice=${encodeURIComponent("Rolled back. A new release was created with the old files.")}`);
}
