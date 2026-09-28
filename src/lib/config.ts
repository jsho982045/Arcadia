/** Central configuration. Every value can be overridden with an environment variable. */
export const config = {
  appName: process.env.NEXT_PUBLIC_APP_NAME || "Arcadia",
  appOrigin: process.env.APP_ORIGIN || "http://localhost:3002",
  /** Games are served from this separate origin so their code can never touch the main site. */
  playOrigin: process.env.NEXT_PUBLIC_PLAY_ORIGIN || "http://localhost:3001",
  storageDir: process.env.STORAGE_DIR || ".data/storage",

  /** Free players get this many seconds of active play per day (across all games). */
  freeDailySeconds: Number(process.env.FREE_DAILY_SECONDS || 30 * 60),
  /** Pro price in cents per month, used for the creator-pool estimate. */
  proPriceCents: Number(process.env.PRO_PRICE_CENTS || 599),
  /** Share of net subscription revenue paid to creators. */
  creatorPoolShare: Number(process.env.CREATOR_POOL_SHARE || 0.5),
  /** Rough payment-processing cost used to go from gross to net. */
  paymentFeeRate: Number(process.env.PAYMENT_FEE_RATE || 0.08),

  /** Seconds credited per heartbeat and the minimum gap between heartbeats. */
  heartbeatSeconds: 15,
  minHeartbeatGapMs: 12_000,
  /** Max seconds one player can earn a single game per day (anti-farming). */
  maxDailySecondsPerGame: 4 * 60 * 60,

  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || 50) * 1024 * 1024,
  maxFiles: 2000,

  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  stripePriceId: process.env.STRIPE_PRICE_ID || "",
};

export const stripeEnabled = () => Boolean(config.stripeSecretKey && config.stripePriceId);

export const CATEGORIES = [
  { id: "arcade", label: "Arcade" },
  { id: "action", label: "Action" },
  { id: "puzzle", label: "Puzzle" },
  { id: "racing", label: "Racing" },
  { id: "platformer", label: "Platformer" },
  { id: "sports", label: "Sports" },
  { id: "strategy", label: "Strategy" },
  { id: "casual", label: "Casual" },
] as const;

export const LICENSES: Record<string, { label: string; summary: string; forkable: boolean }> = {
  "arcadia-remix": {
    label: "Arcadia Remix",
    summary: "Anyone can play, fork and suggest changes on Arcadia. Not allowed to be re-published elsewhere.",
    forkable: true,
  },
  mit: { label: "MIT", summary: "Open source. Anyone can reuse the code anywhere, with credit.", forkable: true },
  "cc-by-4.0": { label: "CC BY 4.0", summary: "Reuse anywhere with credit.", forkable: true },
  "all-rights-reserved": {
    label: "All rights reserved",
    summary: "Play only. Source is visible but forks and pull requests are disabled.",
    forkable: false,
  },
};
