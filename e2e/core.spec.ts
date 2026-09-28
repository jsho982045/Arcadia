import { test, expect, type Page } from "@playwright/test";
import JSZip from "jszip";

const uid = Date.now().toString(36);

async function signup(page: Page, username: string) {
  await page.goto("/signup");
  await page.fill("#username", username);
  await page.fill("#email", `${username}@test.dev`);
  await page.fill("#password", "password123");
  await page.check('input[name="age"]');
  await page.check('input[name="terms"]');
  await page.click('button:has-text("Continue to start free trial")');
  await page.waitForURL("/");
}

async function login(page: Page, user: string, pw: string) {
  await page.goto("/login");
  await page.fill("#login", user);
  await page.fill("#password", pw);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL("/");
}

test("home lists the seed games and a game plays in the sandbox", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("game-card").first()).toBeVisible();
  expect(await page.getByTestId("game-card").count()).toBeGreaterThanOrEqual(6);

  await page.goto("/g/arcadia/neon-serpent");
  await page.getByTestId("play-button").click();
  const frame = page.frameLocator('[data-testid="game-frame"]');
  await expect(frame.locator("canvas")).toBeVisible();
  // The SDK is injected and the sandbox has an opaque origin (no access to site cookies).
  const f = page.frames().find((x) => x.url().includes("/v/"))!;
  expect(await f.evaluate(() => typeof (window as unknown as { Arcadia: unknown }).Arcadia)).toBe("object");
  expect(await f.evaluate(() => { try { return document.cookie; } catch { return "blocked"; } })).toBe("blocked");
  expect(await f.evaluate(() => { localStorage.setItem("x", "1"); return localStorage.getItem("x"); })).toBe("1");
  // Network is blocked by CSP.
  const net = await f.evaluate(() => fetch("https://example.com").then(() => "ok", () => "blocked"));
  expect(net).toBe("blocked");
});

test("fork → edit → pull request → owner merges", async ({ page, browser }) => {
  const user = `tester${uid}`;
  await signup(page, user);
  await page.goto("/g/arcadia/tile-fusion");
  await page.click('button:has-text("Fork & improve")');
  await page.waitForURL(`**/g/${user}/tile-fusion/edit`);

  // Edit game.js in Monaco.
  await page.locator(".monaco-editor").first().waitFor();
  await page.locator(".monaco-editor .view-lines").first().click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\n// improved by the e2e test\n");
  await page.fill('input[placeholder="Describe your change"]', "Add a friendly comment");
  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("editor-status")).toContainText("Saved as v2");

  await page.goto(`/g/${user}/tile-fusion/pulls/new`);
  await page.fill("#title", "Add a friendly comment");
  await page.fill("#body", "Small change from the test suite.");
  await page.click('button:has-text("Open pull request")');
  await page.waitForURL("**/g/arcadia/tile-fusion/pulls/*");
  const prUrl = page.url();
  await page.goto(prUrl + "?tab=files");
  await expect(page.locator("text=improved by the e2e test")).toBeVisible();

  // The owner merges it.
  const ctx = await browser.newContext({ baseURL: process.env.BASE_URL || "http://localhost:3002" });
  const owner = await ctx.newPage();
  await login(owner, "arcadia", process.env.SEED_ADMIN_PASSWORD || "arcadia-admin");
  await owner.goto(prUrl);
  await owner.click('button:has-text("Merge & release")');
  await expect(owner.locator("text=Merged as")).toBeVisible();
  await owner.goto("/g/arcadia/tile-fusion/releases");
  await expect(owner.locator("text=Merge #").first()).toBeVisible();
  await ctx.close();
});

test("publish a zip → review queue → admin approves", async ({ page, browser }) => {
  const user = `maker${uid}`;
  await signup(page, user);
  const zip = new JSZip();
  zip.file("my-game/index.html", "<!doctype html><title>t</title><canvas></canvas><script src=main.js></script>");
  zip.file("my-game/main.js", "Arcadia.submitScore(1)");
  zip.file("my-game/arcadia.json", JSON.stringify({ title: `Test Game ${uid}`, category: "casual" }));
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  await page.goto("/new");
  await page.setInputFiles("#zip", { name: "game.zip", mimeType: "application/zip", buffer: buf });
  await page.click('button:has-text("Publish")');
  await page.waitForURL("**/g/**?published=1");
  await expect(page.locator("text=review queue")).toBeVisible();

  const ctx = await browser.newContext({ baseURL: process.env.BASE_URL || "http://localhost:3002" });
  const admin = await ctx.newPage();
  await login(admin, "arcadia", process.env.SEED_ADMIN_PASSWORD || "arcadia-admin");
  await admin.goto("/admin");
  const card = admin.locator(".card", { hasText: `Test Game ${uid}` });
  await card.locator('button:has-text("Approve")').click();
  await admin.goto(`/browse?q=${uid}`);
  await expect(admin.getByTestId("game-card")).toHaveCount(1);
  await ctx.close();
});

test("visitors play free games only; subscribers play everything", async ({ page, browser }) => {
  const beatFor = (p: Page, id: string | null) =>
    p.evaluate(async (gid) => {
      const r = await fetch("/api/play/heartbeat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gameId: gid }) });
      return { status: r.status, body: await r.json() };
    }, id);
  // Visitor: free game is playable and tracked against the daily allowance...
  await page.goto("/g/arcadia/neon-serpent");
  const freeId = await page.locator("[data-game-id]").getAttribute("data-game-id");
  const first = await beatFor(page, freeId);
  expect(first.body.credited).toBe(15);
  expect(first.body.remaining).toBe(30 * 60 - 15);
  expect((await beatFor(page, freeId)).body.credited).toBe(0); // rate-limited
  // ...but a subscriber-only game is locked.
  await page.goto("/g/arcadia/gem-swap");
  await expect(page.locator("text=This game is for subscribers")).toBeVisible();
  // Signing in without a subscription is not possible: signup goes through the trial (dev mode grants it without a card).
  await signup(page, `player${uid}`);
  await page.goto("/g/arcadia/gem-swap");
  const paidId = await page.locator("[data-game-id]").getAttribute("data-game-id");
  const paid = await beatFor(page, paidId);
  expect(paid.status).toBe(200);
  expect(paid.body.remaining).toBeNull();
  await expect(page.locator("header").getByText("PRO", { exact: true })).toBeVisible();
  void browser;
});
