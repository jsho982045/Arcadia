# Arcadia

A modern browser arcade where anyone can **play**, **publish** and **improve** games together, like GitHub for games.

- Play instantly in the browser (desktop and mobile), with leaderboards and cloud saves.
- Publish any HTML5 game as a zip, or start from a template and code in the browser.
- Fork any game, edit it in the in-browser editor, and open a **pull request** with a playable preview and a line-by-line diff. The owner merges with one click.
- Free players get 30 minutes of play a day; **Pro** is unlimited. 50% of net subscription revenue goes to creators by active play time, and merged contributors share in each game's earnings.

"Arcadia" is a placeholder name. Change it with `NEXT_PUBLIC_APP_NAME`.

---

## Quick start

Requirements: **Node.js 20.12+** (22 recommended). Nothing else: the database is embedded for local development.

```bash
npm install          # also copies the Monaco editor into public/monaco
cp .env.example .env # optional, every setting has a default
npm run setup        # create the database and seed 6 games + demo users
npm run dev          # site on http://localhost:3002, game server on http://localhost:3001
```

Demo accounts (from the seed):

| Username | Password | Notes |
| --- | --- | --- |
| `arcadia` | `arcadia-admin` (or `SEED_ADMIN_PASSWORD`) | Admin, owns the 6 seed games |
| `pixelpat` | `password123` | Has an open pull request on Brick Blitz |
| `mayaplays` | `password123` | Pro subscriber |

To start over, stop the server and delete the `.data/` folder, then run `npm run setup` again.

---

## What's in the box

| Area | Where |
| --- | --- |
| Pages (Next.js App Router) | `src/app` |
| Server actions (forms) | `src/app/actions` |
| JSON APIs (heartbeat, scores, saves, zip download, Stripe webhook) | `src/app/api` |
| Database schema (Drizzle) | `src/lib/db/schema.ts`, migrations in `drizzle/` |
| Games, versions, forks, PRs, merge logic | `src/lib/games.ts`, `src/lib/trees.ts` |
| Upload checks | `src/lib/checks.ts` |
| Play-time tracking, free cap, creator pool maths | `src/lib/play.ts` |
| Game file storage (content-addressed) | `src/lib/storage.ts` |
| **Play server** (serves games from a separate origin) | `play-server/server.mjs` |
| **Game SDK** (auto-injected into every game) | `play-server/arcadia-sdk.js` |
| Seed games | `seed-games/*` |
| "Start from a template" game | `templates/starter` |
| End-to-end tests | `e2e/` |

### The six seed games

Brick Blitz (breakout with power-ups), Neon Serpent (snake), Tile Fusion (2048-style merge), Sky Hopper (endless platformer), Neon Drift (traffic racer) and Gem Swap (timed match-3). All original, dependency-free canvas games that use the SDK for scores.

---

## How it works

### Security model: games are untrusted code

1. Games are served by the **play server** on a different origin from the site (`localhost:3001` locally; a separate registered domain in production, e.g. `arcadia-play.net`).
2. The site embeds them in `<iframe sandbox="allow-scripts allow-pointer-lock">` **without** `allow-same-origin`, so each game runs with an opaque origin: no cookies, no real localStorage, no access to the site.
3. The play server sends a strict Content-Security-Policy: no network requests to anywhere except the play server itself, no forms, and it can only be framed by the site.
4. Games talk to the site only through the SDK's `postMessage` bridge. The site validates every message and checks scores and play time server-side.
5. Every upload/commit runs automatic checks (`src/lib/checks.ts`): required `index.html`, size and file limits, blocked file types, and warnings for external URLs, `eval`, cookies/WebSockets and obfuscation. New creators' games go to a moderation queue (`/admin`).

### The game SDK

Injected into every HTML page a game serves:

```js
Arcadia.submitScore(1200);       // leaderboard (personal bests only)
Arcadia.save({ level: 3 });      // cloud save for signed-in players
Arcadia.load();                  // last save, available immediately
Arcadia.onPause(fn); Arcadia.onResume(fn);
```

Because sandboxed frames can't use `localStorage`, the SDK installs a drop-in replacement that syncs to the player's cloud save, so existing games work unchanged. It also reports player input so only *active* play counts.

### Versions, forks and pull requests

- Every game's files are stored content-addressed (`blobs/<sha256>`); each **version** is an immutable file tree. Versions are cheap and deduplicated across forks.
- **Fork** copies the current tree into the user's account and remembers the base version.
- A **pull request** compares the fork's latest version to its base. While open it follows new commits on the fork.
- **Merge** does a file-level three-way merge (base / live / fork). A file conflicts only if both sides changed it differently. The fork owner can **Sync** to resolve.
- Merging creates a new live version, awards contributor points (1/3/5), and closes issues referenced with `Fixes #12`.
- **Rollback** creates a new version with an old version's files; history is never rewritten.

### Money

- Pro via Stripe Checkout + Billing Portal (`src/lib/stripe.ts`). Without Stripe keys the Pro page has a **dev mode** toggle.
- Play time: the player page sends a heartbeat every 15 s only while the tab is visible and the player has touched the controls in the last 30 s. The server rate-limits heartbeats and caps credit per game per day.
- `computeCreatorPool()` in `src/lib/play.ts`: each Pro subscriber's share of the pool (price × (1 − fees) × 50%) is split across the games *they* played by minutes, then each game's money is split owner / contributors (by points). The creator dashboard shows live estimates.
- Payouts (Stripe Connect) are the next step. The maths is done; the transfer isn't wired up yet.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Site + play server with hot reload |
| `npm run build` / `npm start` | Production build / run both servers |
| `npm run setup` | Migrate + seed |
| `npm run db:generate` | Create a new migration after changing `schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run typecheck` / `npm run lint` | Checks |
| `npm run test:e2e` | Playwright tests (run `npm run dev` first; `npx playwright install chromium` once) |

---

## Deploying to production

The embedded database (PGlite) is for local development only. In production use real Postgres and put the play server on its own domain.

1. **Postgres**: create a database on Neon, Supabase or Fly Postgres and set `DATABASE_URL`.
2. **Two domains**: e.g. `arcadia.gg` for the site and `arcadia-play.net` for games. Set `APP_ORIGIN=https://arcadia.gg` and `NEXT_PUBLIC_PLAY_ORIGIN=https://arcadia-play.net`. The play domain must be a *different registrable domain*, not a subdomain.
3. **Storage**: the app and play server share `STORAGE_DIR`. On a single server (Fly.io, Render, a VPS), point it at a persistent volume. To scale out later, reimplement the five functions in `src/lib/storage.ts` against Cloudflare R2/S3 and serve `/v/*` from a CDN.
4. **Stripe**: create a monthly Price, then set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` and `STRIPE_WEBHOOK_SECRET`. Point a webhook at `https://<site>/api/stripe/webhook` for `checkout.session.completed` and `customer.subscription.*`.
5. Run `npm run db:migrate` on deploy. Seed only if you want the demo games (`SEED_ADMIN_PASSWORD` set to something strong).

A `Dockerfile` is included that runs both servers in one container. Put the site domain in front of port 3000 and the play domain in front of port 3001, and mount a volume at `/data`.

```bash
docker build -t arcadia .
docker run -p 3000:3000 -p 3001:3001 -v arcadia-data:/data \
  -e DATABASE_URL=postgres://... \
  -e APP_ORIGIN=https://arcadia.gg -e NEXT_PUBLIC_PLAY_ORIGIN=https://arcadia-play.net arcadia
```

`NEXT_PUBLIC_PLAY_ORIGIN` is read at build time, so pass it as a build arg as well (`--build-arg NEXT_PUBLIC_PLAY_ORIGIN=...`).

### Launch checklist

- [ ] Final name, logo and domains (check trademark availability)
- [ ] Lawyer review of `/terms` and `/privacy` (they're marked as drafts), DMCA agent registered
- [ ] Stripe live mode, Stripe Tax, company entity
- [ ] Strong `SEED_ADMIN_PASSWORD` or no seed; change the admin password
- [ ] Error monitoring (Sentry) and daily database backups
- [ ] Email verification and password reset (not built yet, see below)

## Not built yet (next steps)

- Password reset and email verification (needs an email provider such as Resend or Postmark)
- GitHub/Google sign-in
- Stripe Connect payouts (earnings are calculated, not paid)
- Maintainers (non-owner reviewers), inline code review comments
- AI pull-request summaries and "describe a game → starter game"
- R2/S3 storage adapter for multi-server deploys
- Multiplayer SDK, achievements, notifications
