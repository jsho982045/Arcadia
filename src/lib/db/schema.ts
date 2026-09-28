import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
  date,
} from "drizzle-orm/pg-core";

/** A file tree: path -> { h: sha256 of contents, s: size in bytes } */
export type Tree = Record<string, { h: string; s: number }>;

export type CheckItem = { level: "pass" | "warn" | "fail"; message: string; file?: string };
export type CheckReport = { status: "pass" | "warn" | "fail"; items: CheckItem[] };

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  bio: text("bio").notNull().default(""),
  isAdmin: boolean("is_admin").notNull().default(false),
  trusted: boolean("trusted").notNull().default(false),
  banned: boolean("banned").notNull().default(false),
  plan: text("plan").notNull().default("free"), // free | pro
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256 of the cookie token
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const games = pgTable(
  "games",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull().references(() => users.id),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    instructions: text("instructions").notNull().default(""),
    category: text("category").notNull().default("arcade"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    // draft | review | published | rejected | fork | archived
    status: text("status").notNull().default("review"),
    reviewNote: text("review_note"),
    license: text("license").notNull().default("arcadia-remix"),
    allowPrs: boolean("allow_prs").notNull().default(true),
    contributorShare: integer("contributor_share").notNull().default(20), // % of game earnings for contributors
    thumbnail: text("thumbnail"), // path inside the tree
    orientation: text("orientation").notNull().default("landscape"),
    forkOfId: text("fork_of_id"),
    forkBaseVersionId: text("fork_base_version_id"), // version of the parent this fork is based on
    currentVersionId: text("current_version_id"),
    nextNumber: integer("next_number").notNull().default(1), // shared counter for issues + PRs
    playCount: integer("play_count").notNull().default(0),
    ratingSum: integer("rating_sum").notNull().default(0),
    ratingCount: integer("rating_count").notNull().default(0),
    isSeed: boolean("is_seed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("games_owner_slug").on(t.ownerId, t.slug), index("games_status").on(t.status)],
);

export const versions = pgTable(
  "versions",
  {
    id: text("id").primaryKey(),
    gameId: text("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    message: text("message").notNull(),
    authorId: text("author_id").notNull().references(() => users.id),
    parentVersionId: text("parent_version_id"),
    tree: jsonb("tree").$type<Tree>().notNull(),
    checks: jsonb("checks").$type<CheckReport>().notNull(),
    prId: text("pr_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("versions_game_number").on(t.gameId, t.number)],
);

export const pullRequests = pgTable(
  "pull_requests",
  {
    id: text("id").primaryKey(),
    number: integer("number").notNull(),
    targetGameId: text("target_game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
    sourceGameId: text("source_game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull().references(() => users.id),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    status: text("status").notNull().default("open"), // open | merged | closed
    baseVersionId: text("base_version_id").notNull(),
    headVersionId: text("head_version_id").notNull(), // frozen at merge/close; follows the fork while open
    mergedVersionId: text("merged_version_id"),
    mergedById: text("merged_by_id"),
    points: integer("points").notNull().default(0), // contributor points awarded at merge
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("prs_target_number").on(t.targetGameId, t.number)],
);

export const issues = pgTable(
  "issues",
  {
    id: text("id").primaryKey(),
    gameId: text("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    authorId: text("author_id").notNull().references(() => users.id),
    kind: text("kind").notNull().default("bug"), // bug | idea
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    status: text("status").notNull().default("open"), // open | closed
    votes: integer("votes").notNull().default(0),
    closedByPrId: text("closed_by_pr_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("issues_game_number").on(t.gameId, t.number)],
);

export const issueVotes = pgTable(
  "issue_votes",
  {
    issueId: text("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.issueId, t.userId] })],
);

/** Comments on a game page, an issue or a pull request. */
export const comments = pgTable(
  "comments",
  {
    id: text("id").primaryKey(),
    targetType: text("target_type").notNull(), // game | issue | pr
    targetId: text("target_id").notNull(),
    authorId: text("author_id").notNull().references(() => users.id),
    body: text("body").notNull(),
    kind: text("kind").notNull().default("comment"), // comment | event
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("comments_target").on(t.targetType, t.targetId)],
);

export const ratings = pgTable(
  "ratings",
  {
    gameId: text("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    stars: integer("stars").notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.userId] })],
);

export const favorites = pgTable(
  "favorites",
  {
    gameId: text("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.userId] })],
);

export const scores = pgTable(
  "scores",
  {
    id: text("id").primaryKey(),
    gameId: text("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("scores_game").on(t.gameId, t.score)],
);

export const saves = pgTable(
  "saves",
  {
    gameId: text("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    data: jsonb("data").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.userId] })],
);

/**
 * Play-time ledger: seconds of *active* play per player, per game, per day.
 * playerKey is a user id, or "anon:<id>" for signed-out players.
 * This is what the free-tier cap and the creator pool are computed from.
 */
export const playLedger = pgTable(
  "play_ledger",
  {
    playerKey: text("player_key").notNull(),
    gameId: text("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    seconds: integer("seconds").notNull().default(0),
    proSeconds: integer("pro_seconds").notNull().default(0), // seconds played while subscribed
    lastBeatAt: timestamp("last_beat_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.playerKey, t.gameId, t.day] }), index("ledger_day").on(t.day)],
);

export const reports = pgTable("reports", {
  id: text("id").primaryKey(),
  targetType: text("target_type").notNull(), // game | comment | pr | issue | user
  targetId: text("target_id").notNull(),
  reporterId: text("reporter_id").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("open"), // open | resolved
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Game = typeof games.$inferSelect;
export type Version = typeof versions.$inferSelect;
export type PullRequest = typeof pullRequests.$inferSelect;
export type Issue = typeof issues.$inferSelect;
