import { and, eq, gte, lt, sql, inArray } from "drizzle-orm";
import { db } from "./db";
import { games, playLedger, pullRequests, users } from "./db/schema";
import { config, monthlyValueCents, parseInterval, type Interval } from "./config";

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function secondsPlayedToday(playerKey: string) {
  const [row] = await db
    .select({ s: sql<number>`coalesce(sum(${playLedger.seconds}), 0)::int` })
    .from(playLedger)
    .where(and(eq(playLedger.playerKey, playerKey), eq(playLedger.day, today())));
  return Number(row?.s ?? 0);
}

export async function remainingFreeSeconds(playerKey: string, isPro: boolean) {
  if (isPro) return Infinity;
  return Math.max(0, config.freeDailySeconds - (await secondsPlayedToday(playerKey)));
}

/**
 * Credit one heartbeat of active play. The client only sends heartbeats while the tab is visible
 * and the player has touched the controls recently; the server also rate-limits them per player.
 */
export async function recordHeartbeat(playerKey: string, gameId: string, isPro: boolean) {
  const day = today();
  const now = new Date();
  const remaining = await remainingFreeSeconds(playerKey, isPro);
  if (remaining <= 0) return { credited: 0, remaining: 0, capped: true };

  // Rate limit across all games for this player.
  const [last] = await db
    .select({ at: sql<Date>`max(${playLedger.lastBeatAt})` })
    .from(playLedger)
    .where(and(eq(playLedger.playerKey, playerKey), eq(playLedger.day, day)));
  if (last?.at && now.getTime() - new Date(last.at).getTime() < config.minHeartbeatGapMs) {
    return { credited: 0, remaining, capped: false };
  }

  const [row] = await db.select().from(playLedger).where(and(eq(playLedger.playerKey, playerKey), eq(playLedger.gameId, gameId), eq(playLedger.day, day)));
  if (row && row.seconds >= config.maxDailySecondsPerGame) return { credited: 0, remaining, capped: false };
  const credit = Math.min(config.heartbeatSeconds, isPro ? config.heartbeatSeconds : remaining);
  if (row) {
    await db
      .update(playLedger)
      .set({ seconds: row.seconds + credit, proSeconds: row.proSeconds + (isPro ? credit : 0), lastBeatAt: now })
      .where(and(eq(playLedger.playerKey, playerKey), eq(playLedger.gameId, gameId), eq(playLedger.day, day)));
  } else {
    await db.insert(playLedger).values({ playerKey, gameId, day, seconds: credit, proSeconds: isPro ? credit : 0, lastBeatAt: now });
  }
  const left = isPro ? Infinity : remaining - credit;
  return { credited: credit, remaining: left, capped: !isPro && left <= 0 };
}

export function monthRange(month?: string) {
  const m = month || new Date().toISOString().slice(0, 7);
  const [y, mo] = m.split("-").map(Number);
  const start = `${m}-01`;
  const end = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 10);
  return { month: m, start, end };
}

/**
 * The creator pool, user-centric: each Pro subscriber's share of the pool is split across
 * the games *they* played, by active minutes. Then each game's money is split between the
 * owner and contributors (by contributor points on merged PRs).
 *
 * Returns estimated earnings per user for a month. Payouts (Stripe Connect) would pay these out.
 */
export async function computeCreatorPool(month?: string) {
  const { start, end } = monthRange(month);
  const rows = await db
    .select({ playerKey: playLedger.playerKey, gameId: playLedger.gameId, secs: sql<number>`sum(${playLedger.proSeconds})::int` })
    .from(playLedger)
    .where(and(gte(playLedger.day, start), lt(playLedger.day, end), sql`${playLedger.proSeconds} > 0`))
    .groupBy(playLedger.playerKey, playLedger.gameId);

  const playerIds = [...new Set(rows.map((r) => r.playerKey))];
  const intervals = new Map<string, Interval>();
  if (playerIds.length) {
    for (const u of await db.select({ id: users.id, i: users.planInterval }).from(users).where(inArray(users.id, playerIds))) intervals.set(u.id, parseInterval(u.i));
  }
  const centsFor = (playerKey: string) => monthlyValueCents(intervals.get(playerKey) ?? "month") * (1 - config.paymentFeeRate) * config.creatorPoolShare;
  const byPlayer = new Map<string, { gameId: string; secs: number }[]>();
  for (const r of rows) {
    if (!byPlayer.has(r.playerKey)) byPlayer.set(r.playerKey, []);
    byPlayer.get(r.playerKey)!.push({ gameId: r.gameId, secs: Number(r.secs) });
  }
  const gameCents = new Map<string, number>();
  const gameSeconds = new Map<string, number>();
  for (const [playerKey, list] of byPlayer) {
    const total = list.reduce((a, b) => a + b.secs, 0);
    for (const { gameId, secs } of list) {
      gameCents.set(gameId, (gameCents.get(gameId) ?? 0) + (centsFor(playerKey) * secs) / total);
      gameSeconds.set(gameId, (gameSeconds.get(gameId) ?? 0) + secs);
    }
  }
  const gameIds = [...gameCents.keys()];
  const earnings = new Map<string, number>(); // userId -> cents
  if (gameIds.length) {
    const gs = await db.select().from(games).where(inArray(games.id, gameIds));
    const merged = await db
      .select({ gameId: pullRequests.targetGameId, userId: pullRequests.authorId, pts: sql<number>`sum(${pullRequests.points})::int` })
      .from(pullRequests)
      .where(and(inArray(pullRequests.targetGameId, gameIds), eq(pullRequests.status, "merged")))
      .groupBy(pullRequests.targetGameId, pullRequests.authorId);
    for (const g of gs) {
      const cents = gameCents.get(g.id) ?? 0;
      const contribs = merged.filter((m) => m.gameId === g.id && m.userId !== g.ownerId);
      const totalPts = contribs.reduce((a, b) => a + Number(b.pts), 0);
      const contribPool = totalPts > 0 ? (cents * g.contributorShare) / 100 : 0;
      earnings.set(g.ownerId, (earnings.get(g.ownerId) ?? 0) + cents - contribPool);
      for (const c of contribs) earnings.set(c.userId, (earnings.get(c.userId) ?? 0) + (contribPool * Number(c.pts)) / totalPts);
    }
  }
  let poolCents = 0;
  for (const k of byPlayer.keys()) poolCents += centsFor(k);
  const perSubscriberCents = byPlayer.size ? poolCents / byPlayer.size : 0;
  return { subscribers: byPlayer.size, gameCents, gameSeconds, earnings, perSubscriberCents, poolCents };
}

export async function gameMinutes(gameIds: string[], month?: string) {
  if (!gameIds.length) return new Map<string, { seconds: number; players: number }>();
  const { start, end } = monthRange(month);
  const rows = await db
    .select({ gameId: playLedger.gameId, secs: sql<number>`sum(${playLedger.seconds})::int`, players: sql<number>`count(distinct ${playLedger.playerKey})::int` })
    .from(playLedger)
    .where(and(inArray(playLedger.gameId, gameIds), gte(playLedger.day, start), lt(playLedger.day, end)))
    .groupBy(playLedger.gameId);
  return new Map(rows.map((r) => [r.gameId, { seconds: Number(r.secs), players: Number(r.players) }]));
}

export async function isPro(userId: string | null | undefined) {
  if (!userId) return false;
  const [u] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, userId));
  return u?.plan === "pro";
}
