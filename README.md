# Arcadia

A modern browser arcade where anyone can **play**, **publish** and **improve** games together, like GitHub for games.

- Play instantly in the browser (desktop and mobile), with leaderboards and cloud saves.
- Publish any HTML5 game as a zip, or start from a template and code in the browser.
- Fork any game, edit it in the in-browser editor, and open a **pull request** with a playable preview and a line-by-line diff. The owner merges with one click.
- Visitors can browse and play the free games without an account. An account needs a subscription: **$5/month or $50/year, both with a 30-day free trial**. 50% of net subscription revenue goes to creators by active play time, and merged contributors share in each game's earnings.

"Arcadia" is a placeholder name. Change it with `NEXT_PUBLIC_APP_NAME`.

---

## Quick start

Requirements: **Node.js 20.12+** (22 recommended). Nothing else: the database is embedded for local development.

```bash
npm install          # also copies the Monaco editor into public/monaco
cp .env.example .env # optional, every setting has a default
npm run setup        # create the database and seed 10 games + demo users
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

### The seed games

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

## Deploying to production (Railway)

One Railway service runs both servers from the `Dockerfile`, with a Railway Postgres database and a volume for game files. `railway.json` holds the build and health-check settings.

1. **Create the project.** In Railway: *New Project → Deploy from GitHub repo → jsho982045/Arcadia*.
2. **Add Postgres.** *+ New → Database → PostgreSQL*.
3. **Add a volume** to the Arcadia service, mounted at **`/data`** (game files live there).
4. **Create two domains.** In the Arcadia service go to *Settings → Networking*:
   - **Generate Domain** with target port **8080**: this is the site (e.g. `arcadia-production.up.railway.app`).
   - **Generate Domain** again with target port **3001**: this is the game server (e.g. `arcadia-play-production.up.railway.app`).
5. **Set variables** on the Arcadia service (*Variables* tab):

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference to the database) |
   | `PORT` | `8080` |
   | `APP_ORIGIN` | `https://<site domain>` |
   | `NEXT_PUBLIC_PLAY_ORIGIN` | `https://<game domain>` |
   | `SEED_DEMO` | `true` (loads the 10 games + demo users; new seed games are added on later deploys) |
   | `SEED_ADMIN_PASSWORD` | a strong password for the `arcadia` admin account |
   | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`, `STRIPE_WEBHOOK_SECRET` | from Stripe (below) |

   Railway redeploys automatically. Every push to `main` deploys again. Migrations run on each start.

6. **Stripe** (start in *test mode*):
   - Switch to a **Sandbox**. *Product catalog → Add product* "Arcadia Pro" with two recurring prices, $5.00/month and $50.00/year → copy both **Price IDs** (`price_…`). The 30-day trial is applied in code at checkout.
   - *Developers → API keys* → copy the **Secret key** (`sk_test_…`).
   - *Developers → Webhooks → Add endpoint*: `https://<site domain>/api/stripe/webhook`, events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` → copy the **Signing secret** (`whsec_…`).
   - *Settings → Billing → Customer portal* → **Activate** (for "Manage billing").
   - Test with card `4242 4242 4242 4242`, any future date, any CVC. When ready, repeat with live keys.

Signup and sign-in go through Stripe Checkout; the account is signed in only after the trial subscription exists. Without Stripe keys the Pro button shows "coming soon" in production (set `ALLOW_DEV_BILLING=true` to enable the no-payment test toggle).

**Domains:** the free `*.up.railway.app` domains are fine for testing. For launch, buy two real domains (about $10/year each), one for the site and one for games, and add them as custom domains with the same target ports.

### Other hosts

The same `Dockerfile` runs anywhere: set the variables above, expose the site port (`$PORT`) and 3001 on two different domains, and mount a persistent volume at `/data`. `NEXT_PUBLIC_PLAY_ORIGIN` is read at build time, so pass it as a build argument too.

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
