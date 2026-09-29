// Orbit Survivors - an Arcadia roguelite survival arena. Vanilla canvas, no libraries.
(() => {
"use strict";
const W = 540, H = 960, WW = 1500, WH = 1700;
const DEBUG = /[?&]debug=1/.test(location.search);
const TAU = Math.PI * 2, PI = Math.PI;
const c = document.getElementById("c");
const ctx = c.getContext("2d", { alpha: false });
let K = 1, cssScale = 1;
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H) || 1, d = Math.min(window.devicePixelRatio || 1, 1.5);
  cssScale = s;
  c.style.width = W * s + "px"; c.style.height = H * s + "px";
  c.width = Math.round(W * s * d); c.height = Math.round(H * s * d);
  K = c.width / W;
}
addEventListener("resize", fit); fit();
const FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';
const rnd = Math.random, cos = Math.cos, sin = Math.sin, sqrt = Math.sqrt, abs = Math.abs, atan2 = Math.atan2, hypot = Math.hypot;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} },
};
const getBest = () => Number(LS.get("orbitsurvivors.best", 0)) || 0;
function loadMeta() {
  let m = null;
  try { m = JSON.parse(LS.get("orbitsurvivors.meta", "null")); } catch (e) {}
  if (!m || typeof m !== "object") m = {};
  m.shards = m.shards | 0; m.lv = m.lv && typeof m.lv === "object" ? m.lv : {}; m.runs = m.runs | 0;
  return m;
}
const meta = loadMeta();
const saveMeta = () => LS.set("orbitsurvivors.meta", JSON.stringify(meta));
const ml = (k) => meta.lv[k] | 0;

// ---------- palette + glow sprites ----------
const COLS = ["#3df2ff", "#ff3d9a", "#ffe14a", "#5dff8a", "#ff8a3d", "#4a8bff", "#b56bff", "#ffffff", "#ff4055", "#ffd35a"];
const CY = 0, MG = 1, YE = 2, GR = 3, OR = 4, BL = 5, PU = 6, WT = 7, RD = 8, GO = 9;
function hexA(h, a) { const n = parseInt(h.slice(1), 16); return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; }
const GL = COLS.map((col) => {
  const s = 64, g = document.createElement("canvas"); g.width = g.height = s;
  const x = g.getContext("2d"), gr = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, hexA(col, 1)); gr.addColorStop(0.18, hexA(col, 0.7)); gr.addColorStop(0.5, hexA(col, 0.2)); gr.addColorStop(1, hexA(col, 0));
  x.fillStyle = gr; x.fillRect(0, 0, s, s); return g;
});
function glow(i, x, y, r, a) { ctx.globalAlpha = a; ctx.drawImage(GL[i], x - r, y - r, r * 2, r * 2); }

// background layers (pre-rendered)
function mkCanvas(w, h) { const e = document.createElement("canvas"); e.width = w; e.height = h; return e; }
const STAR = [0, 1, 2].map((L) => {
  const s = 512, g = mkCanvas(s, s), x = g.getContext("2d");
  const n = [70, 45, 26][L];
  for (let i = 0; i < n; i++) {
    const px = rnd() * s, py = rnd() * s, r = [0.9, 1.3, 1.9][L] * (0.6 + rnd() * 0.8);
    x.fillStyle = ["#7f95ff", "#a8c4ff", "#ffffff"][(rnd() * 3) | 0]; x.globalAlpha = [0.35, 0.5, 0.75][L] * (0.5 + rnd() * 0.5);
    x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill();
  }
  return g;
});
const VIG = (() => {
  const g = mkCanvas(W, H), x = g.getContext("2d"), gr = x.createRadialGradient(W / 2, H / 2, 260, W / 2, H / 2, 620);
  gr.addColorStop(0, "rgba(2,3,12,0)"); gr.addColorStop(1, "rgba(2,3,12,0.72)");
  x.fillStyle = gr; x.fillRect(0, 0, W, H); return g;
})();
const NEB = [[300, 300, 4, 520], [1200, 500, 6, 480], [700, 1000, 1, 560], [1250, 1450, 5, 500], [250, 1400, 6, 470]];

// ---------- text ----------
const fonts = {};
function fnt(size, weight) { const k = size + "_" + (weight || 700); return fonts[k] || (fonts[k] = (weight || 700) + " " + size + "px " + FONT); }
function txt(s, x, y, size, col, align, weight, alpha) {
  ctx.font = fnt(size, weight); ctx.textAlign = align || "center"; ctx.textBaseline = "middle";
  ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.fillStyle = col; ctx.fillText(s, x, y);
}
function rrect(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
}

// ---------- state ----------
let state = "title", paused = false, tG = 0, frameN = 0, hintT = 0, muted = false, timeScale = 1;
try { muted = LS.get("orbitsurvivors.muted", "0") === "1"; } catch (e) {}
const P = { x: WW / 2, y: WH / 2, vx: 0, vy: 0, hp: 100, mhp: 100, r: 13, inv: 0, dashT: 0, dashCd: 0, dashDx: 0, dashDy: 1, shCd: 0, flash: 0, fx: 0, fy: 1, mv: 0, regen: 0, revived: false, hitFlash: 0 };
const RUN = { t: 0, kills: 0, level: 1, xp: 0, need: 10, pending: 0, bossKills: 0, bossIdx: 0, nextBoss: 90, wave: 0, spawnAcc: 0, phase: 0, lv: {}, evo: {}, shards: 0, score: 0, newBest: false, zapT: 0, shootT: 0, shootI: 0, singT: 0, banner: "", bannerT: 0, bannerSub: "", warned: false, combo: 0, comboT: 0 };
const G = { n: 2, baseR: 78, spin: 2.1, power: 1, magR: 70, dashCdMax: 5, xpMul: 1, curR: 78, mult: 1 };
const cam = { x: 0, y: 0, tx: 0, ty: 0, shake: 0, sx: 0, sy: 0 };
const ORB_R = 10, ORB_DMG = 11, SPEED = 200, DASHSPD = 760;
let god = false, botOn = false;
const bot = { dx: 0, dy: 0 };

// ---------- pools ----------
const MAXE = 400, MAXB = 280, MAXPB = 140, MAXG = 300, MAXP = 1100, MAXN = 44, MAXR = 30;
const E = [], EB = [], PB = [], GM = [], PT = [], NUM = [], RG = [];
for (let i = 0; i < MAXE; i++) E.push({ alive: false, type: 0, x: 0, y: 0, vx: 0, vy: 0, hp: 1, mhp: 1, r: 10, spd: 60, dmg: 8, xp: 1, flash: 0, hurtT: 0, ang: 0, t: 0, st: 0, stT: 0, cd: 0, cell: 0, fx: 1, fy: 0, ax: 1, ay: 0, stun: 0, col: 1, wob: 0 });
for (let i = 0; i < MAXB; i++) EB.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, r: 5, dmg: 8, life: 0, col: RD });
for (let i = 0; i < MAXPB; i++) PB.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, dmg: 10, life: 0, pierce: 0, last: -1, col: CY, big: 0 });
for (let i = 0; i < MAXG; i++) GM.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, v: 1, kind: 0, t: 0, att: false });
for (let i = 0; i < MAXP; i++) PT.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, c: 0, drag: 1 });
for (let i = 0; i < MAXN; i++) NUM.push({ x: 0, y: 0, vy: 0, life: 0, txt: "", col: "#fff", size: 14 });
for (let i = 0; i < MAXR; i++) RG.push({ x: 0, y: 0, r: 0, mr: 1, life: 0, max: 1, c: 0, w: 3, a: 1 });
let pn = 0, nn = 0, rn = 0, enemyCount = 0;
const findFree = (arr) => { for (let i = 0; i < arr.length; i++) if (!arr[i].alive) return arr[i]; return null; };

function spark(x, y, vx, vy, life, size, c, drag) {
  const p = PT[pn]; pn = (pn + 1) % MAXP;
  p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.size = size; p.c = c; p.drag = drag || 1;
}
function burst(x, y, c, n, spd, size, life) {
  for (let i = 0; i < n; i++) { const a = rnd() * TAU, s = spd * (0.25 + rnd() * 0.85); spark(x, y, cos(a) * s, sin(a) * s, life * (0.5 + rnd() * 0.7), size * (0.6 + rnd() * 0.8), c, 2.2); }
}
function ring(x, y, mr, life, c, w, a) {
  const r = RG[rn]; rn = (rn + 1) % MAXR; r.x = x; r.y = y; r.r = 4; r.mr = mr; r.life = life; r.max = life; r.c = c; r.w = w || 3; r.a = a == null ? 1 : a;
}
function num(x, y, s, col, size) {
  const n = NUM[nn]; nn = (nn + 1) % MAXN; n.x = x + (rnd() - 0.5) * 12; n.y = y - 8; n.vy = -46; n.life = 0.75; n.txt = s; n.col = col; n.size = size || 14;
}
function shake(a) { if (a > cam.shake) cam.shake = a; }

// ---------- audio glue ----------
const SFXo = window.SFX || { init() {}, resume() {}, suspend() {}, play() {}, tick() {}, setMuted() {} };
const sfx = (n, a) => { try { SFXo.play(n, a); } catch (e) {} };
function audioStart() { try { if (SFXo.init()) { SFXo.setMuted(muted); SFXo.resume(); } } catch (e) {} }
function setMute(m) { muted = m; LS.set("orbitsurvivors.muted", m ? "1" : "0"); try { SFXo.setMuted(m); if (!m) { audioStart(); sfx("click"); } } catch (e) {} }

// ---------- spatial hash ----------
const CS = 64, GWc = Math.ceil(WW / CS), GHc = Math.ceil(WH / CS);
const cellStart = new Int32Array(GWc * GHc + 2), cellCur = new Int32Array(GWc * GHc + 2), cellItems = new Int32Array(MAXE + 4);
const qb = new Int32Array(MAXE + 4), qb2 = new Int32Array(MAXE + 4);
function buildGrid() {
  cellStart.fill(0);
  for (let i = 0; i < MAXE; i++) {
    const e = E[i]; if (!e.alive) continue;
    const cx = clamp((e.x / CS) | 0, 0, GWc - 1), cy = clamp((e.y / CS) | 0, 0, GHc - 1);
    e.cell = cx + cy * GWc; cellStart[e.cell + 1]++;
  }
  for (let i = 1; i < cellStart.length; i++) cellStart[i] += cellStart[i - 1];
  cellCur.set(cellStart);
  for (let i = 0; i < MAXE; i++) if (E[i].alive) cellItems[cellCur[E[i].cell]++] = i;
}
function query(x, y, r, out) {
  let x0 = ((x - r) / CS) | 0, x1 = ((x + r) / CS) | 0, y0 = ((y - r) / CS) | 0, y1 = ((y + r) / CS) | 0, n = 0;
  if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0; if (x1 >= GWc) x1 = GWc - 1; if (y1 >= GHc) y1 = GHc - 1;
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const ci = cx + cy * GWc;
    for (let j = cellStart[ci], je = cellStart[ci + 1]; j < je; j++) out[n++] = cellItems[j];
  }
  return n;
}

// ---------- input ----------
const inp = { id: -1, ax: 0, ay: 0, px: 0, py: 0, dx: 0, dy: 0, down: false, lastUp: 0, lastUpX: 0, lastUpY: 0, downT: 0, sx: 0, sy: 0, moved: 0 };
const keys = { left: false, right: false, up: false, down: false };
const btns = [];
function toLogical(e) { const r = c.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]; }
function hitBtn(x, y) { for (let i = btns.length - 1; i >= 0; i--) { const b = btns[i]; if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b; } return null; }
function requestDash() { if (state !== "play") return; if (RUN.lv.dash && P.dashCd <= 0 && P.dashT <= 0) startDash(); }
c.addEventListener("pointerdown", (e) => {
  e.preventDefault(); audioStart();
  try { c.setPointerCapture(e.pointerId); } catch (x) {}
  const [x, y] = toLogical(e), b = hitBtn(x, y);
  if (b) { b.fn(); return; }
  if (state === "play") {
    if (inp.id === -1) {
      inp.id = e.pointerId; inp.ax = inp.px = x; inp.ay = inp.py = y; inp.down = true; inp.downT = tG; inp.sx = x; inp.sy = y; inp.moved = 0;
      if (tG - inp.lastUp < 0.3 && hypot(x - inp.lastUpX, y - inp.lastUpY) < 60) requestDash();
    } else requestDash();
  }
});
c.addEventListener("pointermove", (e) => {
  if (e.pointerId !== inp.id) return;
  const [x, y] = toLogical(e); inp.px = x; inp.py = y;
});
function endPtr(e) {
  if (e.pointerId !== inp.id) return;
  const short = tG - inp.downT < 0.22 && hypot(inp.px - inp.sx, inp.py - inp.sy) < 14;
  if (short) { inp.lastUp = tG; inp.lastUpX = inp.px; inp.lastUpY = inp.py; } else inp.lastUp = -9;
  inp.id = -1; inp.down = false; inp.dx = inp.dy = 0;
}
c.addEventListener("pointerup", endPtr); c.addEventListener("pointercancel", endPtr);
c.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
function updateStick() {
  if (!inp.down) { inp.dx = inp.dy = 0; return; }
  let dx = inp.px - inp.ax, dy = inp.py - inp.ay; const l = hypot(dx, dy);
  const MAXR_ = 64;
  if (l > MAXR_) { inp.ax += (dx / l) * (l - MAXR_); inp.ay += (dy / l) * (l - MAXR_); dx = inp.px - inp.ax; dy = inp.py - inp.ay; }
  const l2 = hypot(dx, dy);
  if (l2 < 5) { inp.dx = inp.dy = 0; return; }
  const m = Math.min(1, (l2 - 5) / 40);
  inp.dx = (dx / l2) * m; inp.dy = (dy / l2) * m;
}
const KM = { ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down", ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right" };
addEventListener("keydown", (e) => {
  audioStart();
  if (KM[e.key]) { keys[KM[e.key]] = true; e.preventDefault(); return; }
  if (e.key === " ") { e.preventDefault(); if (state === "play") requestDash(); else if (state === "title") startRun(); else if (state === "over") startRun(); return; }
  if (e.key === "Enter") { if (state === "title" || state === "over") startRun(); return; }
  if (e.key === "m" || e.key === "M") { setMute(!muted); return; }
  if (e.key === "p" || e.key === "P" || e.key === "Escape") { if (state === "play") paused = !paused; else if (state === "meta") state = "title"; return; }
  if (state === "levelup" && (e.key === "1" || e.key === "2" || e.key === "3")) chooseCard(Number(e.key) - 1);
});
addEventListener("keyup", (e) => { if (KM[e.key]) keys[KM[e.key]] = false; });
addEventListener("blur", () => { keys.left = keys.right = keys.up = keys.down = false; });
document.addEventListener("visibilitychange", () => { if (document.hidden) { if (state === "play") paused = true; try { SFXo.suspend(); } catch (e) {} } else if (!paused) { try { SFXo.resume(); } catch (e) {} } });
if (window.Arcadia) {
  Arcadia.onPause(() => { if (state === "play") paused = true; try { SFXo.suspend(); } catch (e) {} });
  Arcadia.onResume(() => { paused = false; try { SFXo.resume(); } catch (e) {} });
}

// ---------- upgrades ----------
const UPG = [
  { id: "orb", name: "Extra Orb", max: 8, col: CY, desc: (l) => "+1 orb circling your core" },
  { id: "wide", name: "Wide Orbit", max: 5, col: BL, desc: (l) => "Orbit radius +18. Covers more, but a looser orbit hits softer" },
  { id: "spin", name: "Overdrive Spin", max: 5, col: YE, desc: (l) => "Orbs spin 25% faster" },
  { id: "pow", name: "Orb Power", max: 6, col: OR, desc: (l) => "+30% orb damage" },
  { id: "shoot", name: "Shooter Orbs", max: 4, col: GR, desc: (l) => l === 0 ? "Orbs fire bolts at nearby enemies" : "Bolts fire faster and hit harder" },
  { id: "zap", name: "Arc Lightning", max: 4, col: PU, desc: (l) => l === 0 ? "Lightning links neighbouring orbs and shocks enemies between them" : "Stronger, faster arcs" },
  { id: "shield", name: "Reflect Shield", max: 3, col: CY, desc: (l) => l === 0 ? "A barrier reflects shots and blocks one hit, then recharges" : "Faster recharge, stronger reflections" },
  { id: "mag", name: "Magnet", max: 4, col: GO, desc: (l) => "+40% gem pickup range" },
  { id: "dash", name: "Phase Dash", max: 4, col: MG, desc: (l) => l === 0 ? "Double-tap or Space: dash through enemies, invulnerable" : "Shorter cooldown, harder impact" },
  { id: "vit", name: "Vitality", max: 5, col: RD, desc: (l) => "+25 max HP and heal 35" },
  { id: "regen", name: "Regeneration", max: 3, col: GR, desc: (l) => "Recover +0.9 HP per second" },
];
const EVO = [
  { id: "web", name: "Tesla Web", col: PU, req: ["zap", 2, "spin", 2], desc: "Lightning also links every orb to your core, +50% arc damage" },
  { id: "nova", name: "Nova Barrage", col: GR, req: ["shoot", 2, "orb", 3], desc: "Bolts fire in piercing 3-way volleys" },
  { id: "aegis", name: "Aegis Mirror", col: CY, req: ["shield", 1, "pow", 2], desc: "Reflected shots hit 4x harder and the shield explodes when it breaks" },
  { id: "sing", name: "Singularity", col: PU, req: ["mag", 2, "wide", 2], desc: "Every 9s a black-hole pulse vacuums gems and crushes nearby foes" },
  { id: "blink", name: "Blink Blade", col: MG, req: ["dash", 2, "spin", 2], desc: "Dash recharges 40% faster, ends with a slash wave, orbs spin x2 mid-dash" },
  { id: "vamp", name: "Vampiric Orbs", col: RD, req: ["pow", 3, "regen", 1], desc: "Orb kills heal 1 HP and orbs deal +20% damage" },
];
const UBY = {}; UPG.forEach((u) => (UBY[u.id] = u)); EVO.forEach((u) => { u.evo = true; UBY[u.id] = u; });
const lvOf = (id) => RUN.lv[id] | 0;

function recalc() {
  const lv = RUN.lv;
  G.n = 2 + ml("orb") + (lv.orb | 0);
  G.baseR = 78 + 18 * (lv.wide | 0);
  G.spin = 2.1 * (1 + 0.25 * (lv.spin | 0));
  G.power = (1 + 0.3 * (lv.pow | 0)) * (1 + 0.06 * ml("pow")) * (RUN.evo.vamp ? 1.2 : 1);
  G.magR = 70 * (1 + 0.4 * (lv.mag | 0)) * (1 + 0.12 * ml("mag"));
  G.dashCdMax = 5.2 * Math.pow(0.8, Math.max(0, (lv.dash | 0) - 1)) * (RUN.evo.blink ? 0.6 : 1);
  G.xpMul = 1.3 + 0.08 * ml("xp");
  P.mhp = 100 + 12 * ml("vit") + 25 * (lv.vit | 0);
}
function eligibleEvos() {
  const out = [];
  for (const e of EVO) { if (RUN.evo[e.id]) continue; if (lvOf(e.req[0]) >= e.req[1] && lvOf(e.req[2]) >= e.req[3]) out.push(e); }
  return out;
}
let cards = [null, null, null], cardT = 0;
function rollCards() {
  const pool = [];
  for (const u of UPG) if (lvOf(u.id) < u.max) pool.push(u);
  const evos = eligibleEvos();
  cards = [null, null, null];
  let k = 0;
  if (evos.length && rnd() < 0.85) { cards[k++] = evos[(rnd() * evos.length) | 0]; }
  while (k < 3 && pool.length) {
    // weight: early game favours orb count; avoid duplicates
    let tot = 0; const w = pool.map((u) => { let x = 1; if (u.id === "orb" && RUN.level < 8) x = 1.6; if (u.id === "dash" && !lvOf("dash")) x = 0.8; tot += x; return x; });
    let r = rnd() * tot, idx = 0; for (; idx < pool.length - 1; idx++) { r -= w[idx]; if (r <= 0) break; }
    cards[k++] = pool[idx]; pool.splice(idx, 1);
  }
  for (let i = 0; k < 3; i++, k++) cards[k] = { id: "heal", name: "Repair Kit", col: RD, heal: true, max: 99, desc: () => "Restore 50% of your HP" };
  // shuffle so evolutions are not always first
  for (let i = 2; i > 0; i--) { const j = (rnd() * (i + 1)) | 0, t = cards[i]; cards[i] = cards[j]; cards[j] = t; }
  cardT = 0; prepCards();
}
function applyCard(u) {
  if (u.heal) { P.hp = Math.min(P.mhp, P.hp + P.mhp * 0.5); num(P.x, P.y - 24, "+HP", "#5dff8a", 18); return; }
  if (u.evo) { RUN.evo[u.id] = true; RUN.lv[u.id] = 1; sfx("evo"); shake(10); ring(P.x, P.y, 300, 0.8, GO, 5); burst(P.x, P.y, GO, 40, 320, 3, 0.9); }
  else { RUN.lv[u.id] = lvOf(u.id) + 1; sfx("pick"); if (u.id === "vit") { recalc(); P.hp = Math.min(P.mhp, P.hp + 35); } if (u.id === "dash" && lvOf("dash") === 1) P.dashCd = 0; }
  recalc();
}
function chooseCard(i) {
  if (state !== "levelup" || cardT < 0.35 || !cards[i]) return;
  applyCard(cards[i]); RUN.pending--;
  if (RUN.pending > 0) { rollCards(); sfx("levelup"); } else { state = "play"; inp.dx = inp.dy = 0; }
}
const xpNeed = (l) => Math.round(5 + l * 4 + l * l * 0.4);
function addXP(v) {
  RUN.xp += v * G.xpMul;
  while (RUN.xp >= RUN.need) {
    RUN.xp -= RUN.need; RUN.level++; RUN.need = xpNeed(RUN.level); RUN.pending++;
    ring(P.x, P.y, 200, 0.6, CY, 4); burst(P.x, P.y, CY, 24, 260, 2.5, 0.7);
  }
}

// ---------- enemies ----------
const CH = 0, DA = 1, SP = 2, BR = 3, SH = 4, MI = 5;
//            hp   spd  r   dmg xp col
const TD = [[12, 80, 10, 8, 1, MG], [10, 92, 9, 12, 2, YE], [30, 56, 15, 10, 2, GR], [105, 46, 20, 18, 6, OR], [18, 62, 11, 8, 3, BL], [5, 120, 7, 6, 1, GR]];
const B = { alive: false, x: 0, y: 0, vx: 0, vy: 0, hp: 1, mhp: 1, r: 44, type: 0, t: 0, cd1: 0, cd2: 0, cd3: 0, st: 0, stT: 0, flash: 0, intro: 0, ang: 0, name: "", col: MG, ax: 0, ay: 1, dashHit: 0, hitCd: new Float32Array(20), zapCd: 0 };
function spawnEnemy(type, x, y) {
  const e = findFree(E); if (!e) return null;
  const d = TD[type], hs = 1 + (RUN.t / 150) * 0.55;
  e.alive = true; e.type = type; e.x = x; e.y = y; e.vx = e.vy = 0;
  e.hp = e.mhp = d[0] * (type === MI ? 1 : hs); e.r = d[2]; e.spd = d[1] * (1 + Math.min(0.45, RUN.t / 450)); e.dmg = d[3] * (1 + RUN.t / 500); e.xp = d[4];
  e.flash = 0; e.hurtT = 0; e.ang = rnd() * TAU; e.t = rnd() * 10; e.st = 0; e.stT = 0; e.cd = 1 + rnd() * 2; e.stun = 0; e.col = d[5]; e.wob = rnd() * 6;
  e.fx = 1; e.fy = 0; enemyCount++;
  return e;
}
function edgePos(out) {
  for (let k = 0; k < 6; k++) {
    const m = 46, cx = cam.x, cy = cam.y, per = 2 * (W + H), r = rnd() * per; let x, y;
    if (r < W) { x = cx + r; y = cy - m; } else if (r < W + H) { x = cx + W + m; y = cy + (r - W); } else if (r < 2 * W + H) { x = cx + (r - W - H); y = cy + H + m; } else { x = cx - m; y = cy + (r - 2 * W - H); }
    x = clamp(x, 26, WW - 26); y = clamp(y, 26, WH - 26);
    out[0] = x; out[1] = y;
    if (hypot(x - P.x, y - P.y) > 330) return;
  }
}
const _p = [0, 0];
function spawnRandom() {
  const t = RUN.t;
  const wDa = t > 18 ? 20 + Math.min(30, t / 6) : 0, wSp = t > 30 ? 16 + Math.min(20, t / 10) : 0, wSh = t > 42 ? 12 + Math.min(18, t / 12) : 0, wBr = t > 62 ? 8 + Math.min(20, t / 14) : 0;
  const tot = 100 + wDa + wSp + wSh + wBr; let r = rnd() * tot, type = CH;
  if ((r -= 100) >= 0) { if ((r -= wDa) < 0) type = DA; else if ((r -= wSp) < 0) type = SP; else if ((r -= wSh) < 0) type = SH; else type = BR; }
  edgePos(_p); spawnEnemy(type, _p[0], _p[1]);
}
function waveEvent(w) {
  RUN.banner = "WAVE " + w; RUN.bannerT = 2.2; RUN.bannerSub = ""; sfx("wave");
  if (w < 2 || enemyCount > 250) return;
  const k = w % 4;
  if (k === 2) { const n = 16 + w * 2; RUN.bannerSub = "The swarm closes in"; for (let i = 0; i < n; i++) { const a = (i / n) * TAU; spawnEnemy(CH, clamp(P.x + cos(a) * 400, 30, WW - 30), clamp(P.y + sin(a) * 400, 30, WH - 30)); } }
  else if (k === 3) { const n = 5 + (w >> 1); RUN.bannerSub = "Dashers incoming"; edgePos(_p); for (let i = 0; i < n; i++) spawnEnemy(DA, clamp(_p[0] + (rnd() - 0.5) * 120, 26, WW - 26), clamp(_p[1] + (rnd() - 0.5) * 120, 26, WH - 26)); }
  else if (k === 0) { RUN.bannerSub = "Armored column"; edgePos(_p); const nb = 2 + (w >> 3); for (let i = 0; i < nb; i++) spawnEnemy(BR, clamp(_p[0] + (rnd() - 0.5) * 160, 26, WW - 26), clamp(_p[1] + (rnd() - 0.5) * 160, 26, WH - 26)); for (let i = 0; i < 4; i++) spawnEnemy(SH, clamp(_p[0] + (rnd() - 0.5) * 300, 26, WW - 26), clamp(_p[1] + (rnd() - 0.5) * 300, 26, WH - 26)); }
  else { RUN.bannerSub = "Splitter nest"; edgePos(_p); for (let i = 0; i < 6 + (w >> 2); i++) spawnEnemy(SP, clamp(_p[0] + (rnd() - 0.5) * 220, 26, WW - 26), clamp(_p[1] + (rnd() - 0.5) * 220, 26, WH - 26)); }
}
function director(dt) {
  const t = RUN.t, w = 1 + ((t / 30) | 0);
  if (w !== RUN.wave) { RUN.wave = w; waveEvent(w); }
  let rate = 1.5 + t * 0.034; if (B.alive) rate *= 0.4;
  const cap = Math.min(330, 45 + t * 1.6);
  RUN.spawnAcc += rate * dt;
  while (RUN.spawnAcc >= 1) { RUN.spawnAcc -= 1; if (enemyCount < cap) spawnRandom(); }
  if (!B.alive) {
    if (!RUN.warned && t >= RUN.nextBoss - 3) { RUN.warned = true; RUN.banner = "WARNING"; RUN.bannerSub = "A boss approaches"; RUN.bannerT = 3; sfx("warn"); shake(4); }
    if (t >= RUN.nextBoss) { spawnBoss(RUN.bossIdx); RUN.bossIdx++; RUN.nextBoss = t + 90; RUN.warned = false; }
  }
}
function ebullet(x, y, a, spd, r, dmg, col, life) {
  const b = findFree(EB); if (!b) return;
  b.alive = true; b.x = x; b.y = y; b.vx = cos(a) * spd; b.vy = sin(a) * spd; b.r = r; b.dmg = dmg; b.col = col; b.life = life || 6;
}
function updateEnemies(dt) {
  const px = P.x, py = P.y;
  for (let i = 0; i < MAXE; i++) {
    const e = E[i]; if (!e.alive) continue;
    e.t += dt; if (e.flash > 0) e.flash -= dt; if (e.hurtT > 0) e.hurtT -= dt;
    const dx = px - e.x, dy = py - e.y; let d = hypot(dx, dy); if (d < 0.001) d = 0.001;
    const nx = dx / d, ny = dy / d;
    let tx = 0, ty = 0, sp = e.spd, kk = 4;
    if (e.stun > 0) { e.stun -= dt; sp = 0; }
    switch (e.type) {
      case CH: case MI: { const a = atan2(ny, nx) + sin(e.t * 2 + e.wob) * (e.type === MI ? 0.2 : 0.38); tx = cos(a) * sp; ty = sin(a) * sp; break; }
      case DA:
        e.cd -= dt;
        if (e.st === 0) { tx = nx * sp; ty = ny * sp; if (d < 300 && e.cd <= 0 && e.stun <= 0) { e.st = 1; e.stT = 0.75; } }
        else if (e.st === 1) { e.ax = nx; e.ay = ny; e.stT -= dt; tx = -nx * 20; ty = -ny * 20; if (e.stT <= 0) { e.st = 2; e.stT = 0.55; } }
        else if (e.st === 2) { tx = e.ax * 440; ty = e.ay * 440; kk = 14; e.stT -= dt; if (e.stT <= 0) { e.st = 3; e.stT = 0.8; } }
        else { tx = nx * sp * 0.3; ty = ny * sp * 0.3; e.stT -= dt; if (e.stT <= 0) { e.st = 0; e.cd = 1.6 + rnd(); } }
        break;
      case SP: tx = nx * sp; ty = ny * sp; break;
      case BR: tx = nx * sp; ty = ny * sp; e.fx = nx; e.fy = ny; break;
      case SH:
        e.fx = nx; e.fy = ny;
        if (d > 320) { tx = nx * sp; ty = ny * sp; } else if (d < 220) { tx = -nx * sp; ty = -ny * sp; } else { tx = -ny * sp * 0.6 * (e.wob > 3 ? 1 : -1); ty = nx * sp * 0.6 * (e.wob > 3 ? 1 : -1); }
        e.cd -= dt;
        if (e.st === 0) { if (e.cd <= 0 && d < 560) { e.st = 1; e.stT = 0.55; sfx("telegraph"); } }
        else { e.stT -= dt; tx *= 0.2; ty *= 0.2; if (e.stT <= 0) { e.st = 0; e.cd = 2.4 + rnd() * 0.8; const a = atan2(ny, nx); for (let j = -1; j <= 1; j++) ebullet(e.x, e.y, a + j * 0.2, 175, 5, 8 + RUN.t / 60, BL, 5); sfx("bossShot"); } }
        break;
    }
    const k = Math.min(1, dt * kk);
    e.vx += (tx - e.vx) * k; e.vy += (ty - e.vy) * k;
    e.x += e.vx * dt; e.y += e.vy * dt;
    if (e.x < 20) e.x = 20; else if (e.x > WW - 20) e.x = WW - 20; if (e.y < 20) e.y = 20; else if (e.y > WH - 20) e.y = WH - 20;
    if (e.type !== BR && e.type !== SH) { if (e.vx * e.vx + e.vy * e.vy > 64) e.ang = atan2(e.vy, e.vx); } else e.ang = atan2(e.fy, e.fx);
    if (d < e.r + P.r) {
      if (P.dashT <= 0 && P.inv <= 0) { hurtPlayer(e.dmg, e.x, e.y); e.vx -= nx * 260; e.vy -= ny * 260; e.stun = 0.4; if (e.type === DA && e.st === 2) { e.st = 3; e.stT = 0.8; } }
      else if (P.dashT <= 0) { e.vx -= nx * 60; e.vy -= ny * 60; }
    }
  }
}
function separate() {
  const par = frameN & 1;
  for (let i = par; i < MAXE; i += 2) {
    const e = E[i]; if (!e.alive) continue;
    const n = query(e.x, e.y, e.r + 20, qb2);
    for (let j = 0; j < n; j++) {
      const o = E[qb2[j]]; if (o === e) continue;
      const dx = e.x - o.x, dy = e.y - o.y, mn = e.r + o.r - 3, d2 = dx * dx + dy * dy;
      if (d2 < mn * mn && d2 > 0.01) {
        const d = sqrt(d2), push = (mn - d) * 0.5, wE = o.r / (e.r + o.r);
        e.x += (dx / d) * push * 2 * wE * 1.1; e.y += (dy / d) * push * 2 * wE * 1.1;
      }
    }
  }
}
function hurtE(e, dmg, sx, sy, crit, orb) {
  if (e.type === BR) {
    const dx = sx - e.x, dy = sy - e.y, l = hypot(dx, dy) || 1;
    if ((dx * e.fx + dy * e.fy) / l > 0.45) { dmg *= 0.18; ring(e.x + e.fx * e.r, e.y + e.fy * e.r, 16, 0.2, CY, 2, 0.8); spark(e.x + e.fx * e.r, e.y + e.fy * e.r, (rnd() - 0.5) * 200, (rnd() - 0.5) * 200, 0.3, 2, CY, 3); sfx("reflect"); }
  }
  e.hp -= dmg; e.flash = 0.09;
  if (dmg >= 1) num(e.x, e.y - e.r, String(Math.round(dmg)), crit ? "#ffd35a" : "#ffffff", crit ? 20 : 14);
  if (e.hp <= 0) killE(e, orb);
}
function dropGem(x, y, v, kind) {
  let g = findFree(GM);
  if (!g) { g = GM[(rnd() * MAXG) | 0]; if (g.kind < 3) { g.v += v; return; } }
  g.alive = true; g.x = x; g.y = y; const a = rnd() * TAU, s = 40 + rnd() * 90; g.vx = cos(a) * s; g.vy = sin(a) * s; g.v = v; g.kind = kind || 0; g.t = 0; g.att = false;
}
function killE(e, orb) {
  e.alive = false; enemyCount--; RUN.kills++;
  const c = e.col, big = e.r > 14;
  burst(e.x, e.y, c, big ? 22 : 11, big ? 260 : 190, big ? 3.2 : 2.4, 0.55);
  burst(e.x, e.y, WT, 3, 120, 2, 0.3);
  ring(e.x, e.y, e.r * 3.2, 0.28, c, 2.5, 0.8);
  if (big) { shake(4); sfx("bigkill"); } else sfx("kill", Math.min(8, RUN.combo >> 2));
  RUN.combo++; RUN.comboT = 1.2;
  dropGem(e.x, e.y, e.xp, 0);
  if (e.type === SP) for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + rnd(), m = spawnEnemy(MI, e.x + cos(a) * 10, e.y + sin(a) * 10); if (m) { m.vx = cos(a) * 200; m.vy = sin(a) * 200; m.hp = m.mhp = 5 * (1 + RUN.t / 300); } }
  else if (e.type !== MI) { const r = rnd(); if (r < 0.018 + (P.hp < P.mhp * 0.4 ? 0.02 : 0)) dropGem(e.x, e.y, 0, 3); else if (r > 0.9965) dropGem(e.x, e.y, 0, 4); }
  if (orb && RUN.evo.vamp && P.hp < P.mhp) { P.hp = Math.min(P.mhp, P.hp + 1); }
}

// ---------- boss ----------
const BOSSES = [{ name: "HYDRA CORE", col: MG }, { name: "PRISM WARDEN", col: YE }, { name: "VOIDMAW", col: GR }];
function spawnBoss(idx) {
  const t = idx % 3, def = BOSSES[t];
  B.alive = true; B.type = t; B.name = def.name; B.col = def.col; B.mhp = B.hp = (1400 + 950 * idx) * (1 + RUN.t / 900);
  B.r = 44 + (t === 2 ? 6 : 0); B.x = clamp(P.x, 160, WW - 160); B.y = Math.max(70, cam.y - 90); B.vx = B.vy = 0; B.t = 0; B.cd1 = 1.5; B.cd2 = 3; B.cd3 = 6; B.st = 0; B.stT = 4; B.flash = 0; B.intro = 2.4; B.ang = 0; B.dashHit = 0; B.hitCd.fill(0);
  RUN.banner = def.name; RUN.bannerSub = "BOSS"; RUN.bannerT = 2.6; sfx("warn"); shake(8);
}
function bossApproach(dt, dist, sp) {
  const dx = P.x - B.x, dy = P.y - B.y, d = hypot(dx, dy) || 1, nx = dx / d, ny = dy / d;
  let tx, ty; if (d > dist + 30) { tx = nx * sp; ty = ny * sp; } else if (d < dist - 30) { tx = -nx * sp; ty = -ny * sp; } else { tx = -ny * sp * 0.6; ty = nx * sp * 0.6; }
  B.vx += (tx - B.vx) * Math.min(1, dt * 2); B.vy += (ty - B.vy) * Math.min(1, dt * 2);
  B.x = clamp(B.x + B.vx * dt, 60, WW - 60); B.y = clamp(B.y + B.vy * dt, 60, WH - 60);
}
function updateBoss(dt) {
  B.t += dt; B.ang += dt * 0.8; if (B.flash > 0) B.flash -= dt; if (B.dashHit > 0) B.dashHit -= dt;
  for (let i = 0; i < 20; i++) if (B.hitCd[i] > 0) B.hitCd[i] -= dt;
  if (B.intro > 0) { B.intro -= dt; B.y += (Math.max(120, cam.y + 200) - B.y) * Math.min(1, dt * 1.5); return; }
  const hpf = B.hp / B.mhp, rage = hpf < 0.5 ? 0.7 : 1;
  const aim = atan2(P.y - B.y, P.x - B.x);
  if (B.type === 0) {
    bossApproach(dt, 290, 60);
    B.cd1 -= dt; if (B.cd1 <= 0) { B.cd1 = 2.5 * rage; const n = hpf < 0.5 ? 22 : 15, off = B.t * 0.7; for (let i = 0; i < n; i++) ebullet(B.x, B.y, off + (i * TAU) / n, 140, 6, 10, MG, 7); sfx("bossShot"); ring(B.x, B.y, 90, 0.4, MG, 4); }
    B.cd2 -= dt; if (B.cd2 <= 0) { B.cd2 = 5 * rage; for (let j = -2; j <= 2; j++) ebullet(B.x, B.y, aim + j * 0.17, 230, 5, 10, RD, 6); sfx("bossShot"); }
    B.cd3 -= dt; if (B.cd3 <= 0) { B.cd3 = 8.5 * rage; for (let i = 0; i < 4; i++) spawnEnemy(CH, B.x + (rnd() - 0.5) * 90, B.y + (rnd() - 0.5) * 90); ring(B.x, B.y, 120, 0.5, MG, 3); }
  } else if (B.type === 1) {
    if (B.st === 0) {
      bossApproach(dt, 300, 50); B.ang += dt * 2;
      B.cd1 -= dt; while (B.cd1 <= 0) { B.cd1 += 0.1 * (hpf < 0.5 ? 0.8 : 1); const a0 = B.t * 2.5; for (let arm = 0; arm < 3; arm++) ebullet(B.x, B.y, a0 + (arm * TAU) / 3, 165, 5, 9, YE, 7); }
      B.stT -= dt; if (B.stT <= 0) { B.st = 1; B.stT = 1.0; sfx("telegraph"); }
    } else if (B.st === 1) {
      B.vx *= 0.9; B.vy *= 0.9; B.stT -= dt; if (B.stT > 0.25) { B.ax = cos(aim); B.ay = sin(aim); }
      if (B.stT <= 0) { B.st = 2; B.stT = 0.55; sfx("dash"); }
    } else if (B.st === 2) {
      B.x = clamp(B.x + B.ax * 820 * dt, 60, WW - 60); B.y = clamp(B.y + B.ay * 820 * dt, 60, WH - 60); B.stT -= dt;
      if (((frameN & 3) === 0)) burst(B.x, B.y, YE, 3, 60, 3, 0.4);
      if (B.stT <= 0) { B.st = 3; B.stT = 1.1; for (let i = 0; i < 12; i++) ebullet(B.x, B.y, (i * TAU) / 12, 190, 5, 10, YE, 5); shake(6); ring(B.x, B.y, 150, 0.4, YE, 4); }
    } else { B.stT -= dt; B.vx *= 0.9; B.vy *= 0.9; if (B.stT <= 0) { B.st = 0; B.stT = 4.5 * rage; } }
  } else {
    bossApproach(dt, 260, 50);
    B.cd1 -= dt; if (B.cd1 <= 0) { B.cd1 = 3.4 * rage; const gap = aim + (rnd() - 0.5) * 0.6, n = 28; for (let i = 0; i < n; i++) { const a = (i * TAU) / n; let da = a - gap; da = atan2(sin(da), cos(da)); if (abs(da) < 0.36) continue; ebullet(B.x, B.y, a, 125, 6, 11, GR, 8); } ring(B.x, B.y, 140, 0.5, GR, 5); sfx("boom"); shake(5); }
    B.cd2 -= dt; if (B.cd2 <= 0) { B.cd2 = 2.7 * rage; for (let j = -3; j <= 3; j++) ebullet(B.x, B.y, aim + j * 0.14, 205, 5, 9, OR, 6); sfx("bossShot"); }
    B.cd3 -= dt; if (B.cd3 <= 0) { B.cd3 = 9 * rage; for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + rnd(); spawnEnemy(SP, B.x + cos(a) * 70, B.y + sin(a) * 70); } ring(B.x, B.y, 130, 0.5, GR, 3); }
  }
  if (!(B.type === 1 && B.st === 2)) { B.x = clamp(B.x, cam.x + 80, cam.x + W - 80); B.y = clamp(B.y, cam.y + 190, cam.y + H - 150); }
  const dx = P.x - B.x, dy = P.y - B.y, d = hypot(dx, dy);
  if (d < B.r + P.r) { if (hurtPlayer(20 + RUN.bossIdx * 3, B.x, B.y)) { P.vx += (dx / d) * 300; P.vy += (dy / d) * 300; } }
}
function hurtBoss(dmg, crit, x, y) {
  if (!B.alive) return;
  if (B.intro > 0) { return; }
  B.hp -= dmg; B.flash = 0.07;
  num(x == null ? B.x : x, (y == null ? B.y : y) - 10, String(Math.round(dmg)), crit ? "#ffd35a" : "#ffffff", crit ? 22 : 15);
  sfx("bossHit");
  if (B.hp <= 0) killBoss();
}
function killBoss() {
  B.alive = false; RUN.bossKills++; timeScale = 0.3; RUN.slowT = 1.0;
  sfx("bossDie"); shake(18);
  for (let i = 0; i < 4; i++) { ring(B.x, B.y, 200 + i * 90, 0.7 + i * 0.15, i & 1 ? WT : B.col, 6); }
  burst(B.x, B.y, B.col, 70, 420, 4, 1.2); burst(B.x, B.y, GO, 40, 300, 3, 1.0); burst(B.x, B.y, WT, 30, 500, 2.5, 0.6);
  for (let i = 0; i < 12; i++) dropGem(B.x, B.y, 10 + RUN.bossIdx * 2, 0);
  dropGem(B.x, B.y, 0, 3); dropGem(B.x, B.y, 0, 4);
  for (let i = 0; i < MAXB; i++) if (EB[i].alive) { burst(EB[i].x, EB[i].y, EB[i].col, 2, 100, 2, 0.3); EB[i].alive = false; }
  for (let i = 0; i < MAXE; i++) { const e = E[i]; if (e.alive && hypot(e.x - B.x, e.y - B.y) < 260) { e.hp = 0; killE(e, false); } }
  RUN.banner = "BOSS DEFEATED"; RUN.bannerSub = "+1500"; RUN.bannerT = 3;
}

// ---------- player ----------
function startDash() {
  let dx = inp.dx, dy = inp.dy;
  if (botOn) { dx = bot.dx; dy = bot.dy; }
  const kx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), ky = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
  if (kx || ky) { dx = kx; dy = ky; }
  let l = hypot(dx, dy); if (l < 0.1) { dx = P.fx; dy = P.fy; l = hypot(dx, dy) || 1; }
  P.dashDx = dx / l; P.dashDy = dy / l; P.dashT = 0.16 + 0.02 * lvOf("dash"); P.dashCd = G.dashCdMax; P.inv = Math.max(P.inv, P.dashT + 0.2);
  sfx("dash"); ring(P.x, P.y, 60, 0.3, MG, 3); shake(2);
}
function hurtPlayer(d, sx, sy) {
  if (P.inv > 0 || P.dashT > 0 || state !== "play") return false;
  const sl = lvOf("shield");
  if (sl && P.shCd <= 0) {
    P.shCd = Math.max(4, 11.5 - 2.5 * sl); P.inv = 0.6; sfx("shieldPop"); shake(6);
    ring(P.x, P.y, 170, 0.5, CY, 5); burst(P.x, P.y, CY, 20, 260, 2.5, 0.6);
    const n = query(P.x, P.y, 140, qb);
    for (let j = 0; j < n; j++) { const e = E[qb[j]]; if (!e.alive) continue; const dx = e.x - P.x, dy = e.y - P.y, l = hypot(dx, dy) || 1; e.vx += (dx / l) * 420; e.vy += (dy / l) * 420; e.stun = 0.4; if (RUN.evo.aegis) hurtE(e, 60 * G.power, P.x, P.y, false, false); }
    return false;
  }
  P.hp -= d; P.inv = 0.75; P.hitFlash = 1; shake(9 + d * 0.15); sfx("hurt");
  burst(P.x, P.y, RD, 14, 260, 2.8, 0.5); ring(P.x, P.y, 80, 0.3, RD, 4);
  num(P.x, P.y - 20, "-" + Math.round(d), "#ff6070", 18);
  if (god && P.hp < 1) P.hp = 1;
  if (P.hp <= 0) die();
  return true;
}
let deathT = 0;
function die() {
  if (ml("rev") && !P.revived) {
    P.revived = true; P.hp = P.mhp * 0.5; P.inv = 2.2; sfx("revive"); shake(12);
    ring(P.x, P.y, 400, 0.8, GO, 6); ring(P.x, P.y, 260, 0.6, WT, 4); burst(P.x, P.y, GO, 40, 400, 3, 0.9);
    for (let i = 0; i < MAXE; i++) { const e = E[i]; if (e.alive && hypot(e.x - P.x, e.y - P.y) < 300) { e.hp = 0; killE(e, false); } }
    for (let i = 0; i < MAXB; i++) EB[i].alive = false;
    RUN.banner = "SECOND CHANCE"; RUN.bannerSub = ""; RUN.bannerT = 2; return;
  }
  P.hp = 0; state = "dying"; deathT = 0; inp.dx = inp.dy = 0;
  sfx("over"); shake(16); burst(P.x, P.y, CY, 60, 420, 3.5, 1.2); burst(P.x, P.y, WT, 30, 300, 2.5, 0.8); ring(P.x, P.y, 320, 0.9, CY, 6); ring(P.x, P.y, 200, 0.7, WT, 3);
  RUN.score = calcScore();
  RUN.shards = Math.floor(RUN.t / 8) + Math.floor(RUN.kills / 20) + RUN.bossKills * 25 + RUN.level * 2;
  const best = getBest(); RUN.newBest = RUN.score > best; if (RUN.newBest) LS.set("orbitsurvivors.best", RUN.score);
  meta.shards += RUN.shards; meta.runs++; saveMeta(); LS.set("orbitsurvivors.tut", "1");
  if (window.Arcadia) { try { Arcadia.submitScore(RUN.score); Arcadia.gameOver(); } catch (e) {} }
}
const calcScore = () => Math.floor(RUN.t) * 10 + RUN.kills * 5 + RUN.bossKills * 1500;

function updatePlayer(dt) {
  let dx = 0, dy = 0;
  if (botOn) { dx = bot.dx; dy = bot.dy; } else {
    dx = inp.dx; dy = inp.dy;
    const kx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), ky = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    if (kx || ky) { const l = hypot(kx, ky); dx = kx / l; dy = ky / l; }
  }
  if (dx || dy) { const l = hypot(dx, dy) || 1; P.fx = dx / l; P.fy = dy / l; }
  const sp = SPEED * (1 + 0.04 * ml("spd"));
  if (P.dashT > 0) {
    P.dashT -= dt; P.vx = P.dashDx * DASHSPD; P.vy = P.dashDy * DASHSPD;
    const n = query(P.x, P.y, 44, qb);
    for (let j = 0; j < n; j++) { const e = E[qb[j]]; if (!e.alive || e.hurtT > 0) continue; if (hypot(e.x - P.x, e.y - P.y) < e.r + 22) { e.hurtT = 0.3; hurtE(e, (22 + 9 * lvOf("dash")) * G.power, P.x, P.y, false, false); } }
    if (B.alive && B.dashHit <= 0 && hypot(B.x - P.x, B.y - P.y) < B.r + 24) { B.dashHit = 0.4; hurtBoss((30 + 10 * lvOf("dash")) * G.power, false); }
    spark(P.x, P.y, 0, 0, 0.35, 9, MG, 1); spark(P.x, P.y, 0, 0, 0.3, 5, WT, 1);
    if (P.dashT <= 0 && RUN.evo.blink) {
      sfx("boom"); shake(7); ring(P.x, P.y, 190, 0.45, MG, 6); ring(P.x, P.y, 120, 0.3, WT, 3);
      const m = query(P.x, P.y, 160, qb);
      for (let j = 0; j < m; j++) { const e = E[qb[j]]; if (e.alive) { const ex = e.x - P.x, ey = e.y - P.y, l = hypot(ex, ey) || 1; e.vx += (ex / l) * 380; e.vy += (ey / l) * 380; hurtE(e, 40 * G.power, P.x, P.y, false, false); } }
      if (B.alive && hypot(B.x - P.x, B.y - P.y) < 200) hurtBoss(60 * G.power, false);
    }
  } else {
    const k = 1 - Math.exp(-dt * 7);
    P.vx += (dx * sp - P.vx) * k; P.vy += (dy * sp - P.vy) * k;
  }
  P.x = clamp(P.x + P.vx * dt, 16, WW - 16); P.y = clamp(P.y + P.vy * dt, 16, WH - 16);
  const spd = hypot(P.vx, P.vy), mvT = spd > 45 ? 1 : 0;
  P.mv += (mvT - P.mv) * Math.min(1, dt * (mvT ? 8 : 2.6));
  if (P.inv > 0) P.inv -= dt; if (P.dashCd > 0) P.dashCd -= dt; if (P.shCd > 0) P.shCd -= dt; if (P.hitFlash > 0) P.hitFlash -= dt * 3;
  if (spd > 60 && (frameN & 1) === 0) spark(P.x - P.vx * 0.03, P.y - P.vy * 0.03, -P.vx * 0.1 + (rnd() - 0.5) * 30, -P.vy * 0.1 + (rnd() - 0.5) * 30, 0.35, 3, CY, 3);
  const rl = lvOf("regen"); if (rl && P.hp < P.mhp) P.hp = Math.min(P.mhp, P.hp + 0.9 * rl * dt);
  if (RUN.comboT > 0) { RUN.comboT -= dt; if (RUN.comboT <= 0) RUN.combo = 0; }
  if (RUN.evo.sing) {
    RUN.singT -= dt;
    if (RUN.singT <= 0) {
      RUN.singT = 9; sfx("boom"); ring(P.x, P.y, 260, 0.7, PU, 6); ring(P.x, P.y, 160, 0.5, WT, 3); RUN.vac = 1.6; shake(6);
      const n = query(P.x, P.y, 260, qb);
      for (let j = 0; j < n; j++) { const e = E[qb[j]]; if (e.alive) hurtE(e, 70 * G.power, P.x, P.y, false, false); }
      if (B.alive && hypot(B.x - P.x, B.y - P.y) < 300) hurtBoss(80 * G.power, false);
    }
  }
}

// ---------- orbs, shooters, lightning ----------
const TL = 9, ox = new Float32Array(16), oy = new Float32Array(16), otrail = new Float32Array(16 * TL * 2);
let phase = 0, thead = 0;
function distSeg(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1, vy = y2 - y1, l2 = vx * vx + vy * vy;
  let t = l2 > 0 ? ((px - x1) * vx + (py - y1) * vy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = x1 + vx * t - px, cy = y1 + vy * t - py; return sqrt(cx * cx + cy * cy);
}
function segZap(x1, y1, x2, y2, dmg) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, half = hypot(x2 - x1, y2 - y1) / 2 + 24;
  const n = query(mx, my, half, qb); let hit = 0;
  for (let j = 0; j < n; j++) {
    const e = E[qb[j]]; if (!e.alive) continue;
    if (distSeg(e.x, e.y, x1, y1, x2, y2) < e.r + 8) { hit++; spark(e.x, e.y, (rnd() - 0.5) * 160, (rnd() - 0.5) * 160, 0.25, 2.2, PU, 3); hurtE(e, dmg, mx, my, false, true); }
  }
  if (B.alive && B.intro <= 0 && B.zapCd <= 0 && distSeg(B.x, B.y, x1, y1, x2, y2) < B.r + 8) { hurtBoss(dmg, false, B.x + (rnd() - 0.5) * 30, B.y); hit++; }
  return hit;
}
function nearestTarget(x, y, maxD) {
  let best = -1, bd = maxD * maxD;
  for (let i = 0; i < MAXE; i++) { const e = E[i]; if (!e.alive) continue; const dx = e.x - x, dy = e.y - y, d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; best = i; } }
  return best;
}
function pbullet(x, y, a, spd, dmg, pierce, big) {
  const b = findFree(PB); if (!b) return null;
  b.alive = true; b.x = x; b.y = y; b.vx = cos(a) * spd; b.vy = sin(a) * spd; b.dmg = dmg; b.life = 1.1; b.pierce = pierce; b.last = -1; b.col = big ? GO : GR; b.big = big || 0;
  return b;
}
function updateOrbs(dt) {
  const n = G.n, lv = RUN.lv;
  const dashMul = P.dashT > 0 && RUN.evo.blink ? 2 : 1;
  phase += G.spin * dt * dashMul;
  G.curR = G.baseR * (0.7 + 0.3 * P.mv);
  G.mult = 1 + 0.9 * clamp((112 - G.curR) / 62, 0, 1);
  thead = (thead + 1) % TL;
  for (let i = 0; i < n; i++) {
    const a = phase + (i * TAU) / n;
    ox[i] = P.x + cos(a) * G.curR; oy[i] = P.y + sin(a) * G.curR;
    otrail[(i * TL + thead) * 2] = ox[i]; otrail[(i * TL + thead) * 2 + 1] = oy[i];
  }
  if (B.zapCd > 0) B.zapCd -= dt;
  // collisions
  const dmgBase = ORB_DMG * G.power * G.mult;
  for (let i = 0; i < n; i++) {
    const x = ox[i], y = oy[i], m = query(x, y, ORB_R + 26, qb);
    for (let j = 0; j < m; j++) {
      const e = E[qb[j]]; if (!e.alive || e.hurtT > 0) continue;
      const dx = e.x - x, dy = e.y - y, rr = e.r + ORB_R;
      if (dx * dx + dy * dy < rr * rr) {
        const crit = rnd() < 0.1, dmg = dmgBase * (0.9 + rnd() * 0.2) * (crit ? 2 : 1);
        e.hurtT = 0.19; const l = hypot(dx, dy) || 1; const kb = e.type === BR ? 90 : 190;
        e.vx += (dx / l) * kb; e.vy += (dy / l) * kb;
        spark(x, y, (dx / l) * 140 + (rnd() - 0.5) * 100, (dy / l) * 140 + (rnd() - 0.5) * 100, 0.25, 2.2, crit ? GO : CY, 3);
        sfx(crit ? "crit" : "hit", i);
        hurtE(e, dmg, x, y, crit, true);
      }
    }
    if (B.alive && B.intro <= 0 && B.hitCd[i] <= 0) {
      const dx = B.x - x, dy = B.y - y, rr = B.r + ORB_R;
      if (dx * dx + dy * dy < rr * rr) {
        B.hitCd[i] = 0.2; const crit = rnd() < 0.1;
        spark(x, y, (rnd() - 0.5) * 240, (rnd() - 0.5) * 240, 0.3, 2.4, crit ? GO : CY, 3);
        hurtBoss(dmgBase * (0.9 + rnd() * 0.2) * (crit ? 2 : 1), crit, x, y);
      }
    }
  }
  // shooter orbs
  const sl = lv.shoot | 0;
  if (sl) {
    RUN.shootT -= dt;
    if (RUN.shootT <= 0) {
      RUN.shootT = 1.45 / (1 + 0.4 * (sl - 1));
      const oi = RUN.shootI++ % n; let ex = -1, ey = 0;
      const ti = nearestTarget(ox[oi], oy[oi], 420);
      if (ti >= 0) { ex = E[ti].x; ey = E[ti].y; } else if (B.alive) { ex = B.x; ey = B.y; }
      if (ex >= 0) {
        const a = atan2(ey - oy[oi], ex - ox[oi]), dmg = (9 + 5 * sl) * G.power;
        if (RUN.evo.nova) { for (let j = -1; j <= 1; j++) pbullet(ox[oi], oy[oi], a + j * 0.2, 560, dmg, 3, 1); } else pbullet(ox[oi], oy[oi], a, 560, dmg, 0, 0);
        sfx("shoot"); spark(ox[oi], oy[oi], 0, 0, 0.15, 8, GR, 1);
      } else RUN.shootT = 0.2;
    }
  }
  // lightning
  const zl = lv.zap | 0;
  if (zl && n >= 2) {
    RUN.zapT -= dt;
    if (RUN.zapT <= 0) {
      RUN.zapT = 0.24 / (1 + 0.18 * (zl - 1));
      const dmg = (6 + 4 * zl) * G.power * (RUN.evo.web ? 1.5 : 1); let hits = 0;
      const segs = n === 2 ? 1 : n;
      for (let i = 0; i < segs; i++) { const j = (i + 1) % n; hits += segZap(ox[i], oy[i], ox[j], oy[j], dmg); }
      if (RUN.evo.web) for (let i = 0; i < n; i++) hits += segZap(P.x, P.y, ox[i], oy[i], dmg);
      if (B.alive) B.zapCd = 0;
      if (hits) sfx("zap");
    }
  }
}
function updateBullets(dt) {
  // enemy bullets
  const shOn = lvOf("shield") > 0 && P.shCd <= 0, shR = G.curR + 20;
  for (let i = 0; i < MAXB; i++) {
    const b = EB[i]; if (!b.alive) continue;
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0 || b.x < -20 || b.y < -20 || b.x > WW + 20 || b.y > WH + 20) { b.alive = false; continue; }
    const dx = b.x - P.x, dy = b.y - P.y, d2 = dx * dx + dy * dy;
    if (shOn && d2 < shR * shR && d2 > 1) {
      b.alive = false; sfx("reflect"); ring(b.x, b.y, 22, 0.25, CY, 3);
      const a = atan2(-dy, -dx) + (rnd() - 0.5) * 0.3, dm = 20 * G.power * (RUN.evo.aegis ? 4 : 1);
      const nb = pbullet(b.x, b.y, a + PI, 480, dm, 2, RUN.evo.aegis ? 1 : 0); if (nb) nb.col = CY;
      continue;
    }
    let dead = false;
    for (let o = 0; o < G.n; o++) { const ex = b.x - ox[o], ey = b.y - oy[o], rr = b.r + ORB_R; if (ex * ex + ey * ey < rr * rr) { dead = true; burst(b.x, b.y, b.col, 4, 120, 2, 0.3); sfx("boom"); break; } }
    if (dead) { b.alive = false; continue; }
    if (d2 < (b.r + P.r - 2) * (b.r + P.r - 2)) { if (P.dashT > 0 || P.inv > 0) { if (P.dashT > 0) continue; continue; } b.alive = false; hurtPlayer(b.dmg, b.x, b.y); }
  }
  // player bullets
  for (let i = 0; i < MAXPB; i++) {
    const b = PB[i]; if (!b.alive) continue;
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > WW || b.y > WH) { b.alive = false; continue; }
    if ((frameN & 1) === 0) spark(b.x, b.y, 0, 0, 0.2, b.big ? 5 : 3.5, b.col, 1);
    const m = query(b.x, b.y, 30, qb); let done = false;
    for (let j = 0; j < m; j++) {
      const ei = qb[j], e = E[ei]; if (!e.alive || ei === b.last) continue;
      const dx = e.x - b.x, dy = e.y - b.y, rr = e.r + 5;
      if (dx * dx + dy * dy < rr * rr) {
        hurtE(e, b.dmg, b.x, b.y, false, true); burst(b.x, b.y, b.col, 4, 140, 2, 0.25); sfx("hit", 3);
        if (b.pierce > 0) { b.pierce--; b.last = ei; } else { b.alive = false; done = true; break; }
      }
    }
    if (done) continue;
    if (B.alive && B.intro <= 0 && hypot(B.x - b.x, B.y - b.y) < B.r + 5) { hurtBoss(b.dmg, false, b.x, b.y); b.alive = false; burst(b.x, b.y, b.col, 5, 160, 2, 0.3); }
  }
}
function updateGems(dt) {
  const mr = G.magR, vac = RUN.vac > 0; if (vac) RUN.vac -= dt;
  for (let i = 0; i < MAXG; i++) {
    const g = GM[i]; if (!g.alive) continue;
    g.t += dt;
    const dx = P.x - g.x, dy = P.y - g.y, d = hypot(dx, dy) || 1;
    if (!g.att && (d < mr || vac || (g.kind >= 3 && d < mr * 0.7))) g.att = true;
    if (g.att) { const s = 320 + Math.max(0, 420 - d) * 1.1 + g.t * 20; g.vx = (dx / d) * s; g.vy = (dy / d) * s; }
    else { const f = Math.max(0, 1 - 3.5 * dt); g.vx *= f; g.vy *= f; }
    g.x += g.vx * dt; g.y += g.vy * dt;
    if (g.x < 8) g.x = 8; else if (g.x > WW - 8) g.x = WW - 8; if (g.y < 8) g.y = 8; else if (g.y > WH - 8) g.y = WH - 8;
    if (d < P.r + 10) {
      g.alive = false;
      if (g.kind === 3) { P.hp = Math.min(P.mhp, P.hp + P.mhp * 0.25); sfx("heart"); num(P.x, P.y - 24, "+HP", "#5dff8a", 18); burst(P.x, P.y, GR, 14, 200, 2.5, 0.5); ring(P.x, P.y, 90, 0.4, GR, 3); }
      else if (g.kind === 4) { RUN.vac = 1.8; sfx("heart"); ring(P.x, P.y, 300, 0.6, PU, 4); num(P.x, P.y - 24, "MAGNET", "#b56bff", 16); }
      else { addXP(g.v); RUN.gemCombo = (RUN.gemCombo | 0) + 1; sfx("gem", RUN.gemCombo & 15); spark(P.x, P.y, (rnd() - 0.5) * 100, (rnd() - 0.5) * 100, 0.25, 2.5, g.v >= 8 ? GO : CY, 3); }
    }
  }
  RUN.gemT = (RUN.gemT || 0) - dt; if (RUN.gemT <= 0) { RUN.gemT = 0.4; RUN.gemCombo = 0; }
}
function updateFx(dt) {
  for (let i = 0; i < MAXP; i++) {
    const p = PT[i]; if (p.life <= 0) continue;
    p.life -= dt; const f = Math.max(0, 1 - p.drag * dt); p.vx *= f; p.vy *= f; p.x += p.vx * dt; p.y += p.vy * dt;
  }
  for (let i = 0; i < MAXR; i++) { const r = RG[i]; if (r.life <= 0) continue; r.life -= dt; const t = 1 - r.life / r.max; r.r = 4 + (r.mr - 4) * (1 - (1 - t) * (1 - t)); }
  for (let i = 0; i < MAXN; i++) { const n = NUM[i]; if (n.life <= 0) continue; n.life -= dt; n.y += n.vy * dt; n.vy *= 0.94; }
  if (cam.shake > 0) { cam.shake = Math.max(0, cam.shake - dt * 30); cam.sx = (rnd() - 0.5) * cam.shake; cam.sy = (rnd() - 0.5) * cam.shake; } else cam.sx = cam.sy = 0;
}
function updateCamera(dt, snap) {
  cam.tx = clamp(P.x + P.vx * 0.22 - W / 2, -40, WW - W + 40); cam.ty = clamp(P.y + P.vy * 0.22 - H / 2, -40, WH - H + 40);
  const k = snap ? 1 : 1 - Math.exp(-dt * 3);
  cam.x += (cam.tx - cam.x) * k; cam.y += (cam.ty - cam.y) * k;
}

// ---------- bot (debug) ----------
function botThink() {
  let ax = 0, ay = 0, crowd = 0;
  for (let i = 0; i < MAXE; i++) {
    const e = E[i]; if (!e.alive) continue;
    const dx = P.x - e.x, dy = P.y - e.y, d = hypot(dx, dy);
    if (d < 170) { const w = (1 - d / 170); ax += (dx / (d || 1)) * w * w * 2.2; ay += (dy / (d || 1)) * w * w * 2.2; if (d < 70) crowd++; }
  }
  for (let i = 0; i < MAXB; i++) { const b = EB[i]; if (!b.alive) continue; const dx = P.x - b.x, dy = P.y - b.y, d = hypot(dx, dy); if (d < 110) { const w = 1 - d / 110; ax += (dx / (d || 1)) * w * 1.5; ay += (dy / (d || 1)) * w * 1.5; } }
  if (B.alive) { const dx = P.x - B.x, dy = P.y - B.y, d = hypot(dx, dy); if (d < 260) { const w = 1 - d / 260; ax += (dx / (d || 1)) * w * 1.5; ay += (dy / (d || 1)) * w * 1.5; } }
  let bd = 1e9, bg = null;
  for (let i = 0; i < MAXG; i++) { const g = GM[i]; if (!g.alive) continue; const d = hypot(g.x - P.x, g.y - P.y); if (d < bd) { bd = d; bg = g; } }
  if (bg && bd < 600) { ax += ((bg.x - P.x) / bd) * 0.55; ay += ((bg.y - P.y) / bd) * 0.55; }
  ax += (WW / 2 - P.x) / WW * 0.6; ay += (WH / 2 - P.y) / WH * 0.6;
  const m = 90; if (P.x < m) ax += 1; if (P.x > WW - m) ax -= 1; if (P.y < m) ay += 1; if (P.y > WH - m) ay -= 1;
  const l = hypot(ax, ay); if (l > 0.05) { bot.dx = ax / Math.max(1, l); bot.dy = ay / Math.max(1, l); } else bot.dx = bot.dy = 0;
  if (crowd >= 4) requestDash();
}

// ---------- run control ----------
function startRun() {
  audioStart(); sfx("click");
  for (let i = 0; i < MAXE; i++) E[i].alive = false;
  for (let i = 0; i < MAXB; i++) EB[i].alive = false;
  for (let i = 0; i < MAXPB; i++) PB[i].alive = false;
  for (let i = 0; i < MAXG; i++) GM[i].alive = false;
  for (let i = 0; i < MAXP; i++) PT[i].life = 0;
  for (let i = 0; i < MAXR; i++) RG[i].life = 0;
  for (let i = 0; i < MAXN; i++) NUM[i].life = 0;
  enemyCount = 0; B.alive = false;
  Object.assign(RUN, { t: 0, kills: 0, level: 1, xp: 0, need: xpNeed(1), pending: 0, bossKills: 0, bossIdx: 0, nextBoss: 90, wave: 0, spawnAcc: 0, lv: {}, evo: {}, shards: 0, score: 0, newBest: false, zapT: 0.5, shootT: 1, shootI: 0, singT: 9, banner: "", bannerT: 0, bannerSub: "", warned: false, combo: 0, comboT: 0, vac: 0, slowT: 0, gemT: 0, gemCombo: 0, tut: LS.get("orbitsurvivors.tut", "0") !== "1" });
  if (ml("dash")) RUN.lv.dash = 1;
  P.x = WW / 2; P.y = WH / 2; P.vx = P.vy = 0; P.inv = 1; P.dashT = 0; P.dashCd = 0; P.shCd = 0; P.mv = 0; P.hitFlash = 0; P.revived = false; P.fx = 0; P.fy = 1; P.flash = 0;
  recalc(); P.hp = P.mhp;
  phase = 0; timeScale = 1; paused = false; hintT = 0;
  for (let i = 0; i < 16 * TL; i++) { otrail[i * 2] = P.x; otrail[i * 2 + 1] = P.y; }
  cam.shake = 0; updateCamera(0, true);
  inp.id = -1; inp.down = false; inp.dx = inp.dy = 0;
  state = "play";
}
function stepGame(dt) {
  RUN.t += dt; frameN++;
  if (botOn) botThink(); else updateStick();
  updatePlayer(dt);
  if (state !== "play") return;
  director(dt);
  updateEnemies(dt);
  if (B.alive) updateBoss(dt);
  buildGrid();
  updateOrbs(dt);
  updateBullets(dt);
  separate();
  updateGems(dt);
  updateFx(dt);
  updateCamera(dt);
  if (RUN.bannerT > 0) RUN.bannerT -= dt;
  if (RUN.pending > 0 && state === "play") { state = "levelup"; rollCards(); sfx("levelup"); }
}
// title demo
const demo = []; for (let i = 0; i < 7; i++) demo.push({ a: rnd() * TAU, d: 200 + rnd() * 250, type: (rnd() * 5) | 0, spd: 60 + rnd() * 40 });
let overT = 0, ambT = 0;
function update(dt) {
  tG += dt;
  if (state === "play") {
    if (RUN.slowT > 0) { RUN.slowT -= dt; if (RUN.slowT <= 0) timeScale = 1; }
    stepGame(dt * timeScale); hintT += dt;
    const inten = Math.min(1, enemyCount / 160 + (B.alive ? 0.4 : 0));
    try { SFXo.tick(true, inten); } catch (e) {}
  } else if (state === "levelup") {
    cardT += dt; updateFx(dt * 0.15);
    if (botOn) { cardT = Math.max(cardT, 0.4); chooseCard((rnd() * 3) | 0); }
  } else if (state === "dying") {
    deathT += dt; updateFx(dt * 0.45); if (deathT > 1.5) { state = "over"; overT = 0; }
  } else if (state === "over") {
    overT += dt; updateFx(dt);
  } else {
    // title / meta
    cam.x = WW / 2 - W / 2 + sin(tG * 0.13) * 180; cam.y = WH / 2 - H / 2 + cos(tG * 0.09) * 260; cam.shake = 0; cam.sx = cam.sy = 0;
    ambT -= dt; if (ambT <= 0) { ambT = 0.06; spark(cam.x + rnd() * W, cam.y + H + 10, (rnd() - 0.5) * 20, -30 - rnd() * 60, 5, 1.5 + rnd() * 2, rnd() < 0.5 ? CY : rnd() < 0.5 ? MG : PU, 0); }
    updateFx(dt);
    phase += dt * 1.9;
    for (let i = 0; i < demo.length; i++) {
      const e = demo[i]; e.d -= e.spd * dt;
      if (e.d < 86) { const x = 270 + cos(e.a) * e.d, y = 500 + sin(e.a) * e.d, col = TD[e.type][5]; burst(x + cam.x, y + cam.y, col, 12, 180, 2.4, 0.55); ring(x + cam.x, y + cam.y, 34, 0.3, col, 2.5, 0.8); e.d = 380 + rnd() * 160; e.a = rnd() * TAU; e.type = (rnd() * 5) | 0; }
    }
  }
}

// ---------- drawing helpers ----------
const SHP = [
  [[1, 0], [-0.8, 0.8], [-0.8, -0.8]],
  [[1.3, 0], [-0.4, 0.95], [-0.75, 0], [-0.4, -0.95]],
  [[1, 0], [0.5, 0.87], [-0.5, 0.87], [-1, 0], [-0.5, -0.87], [0.5, -0.87]],
  [[0.85, 0.85], [-0.85, 0.85], [-0.85, -0.85], [0.85, -0.85]],
  [[1, 0], [0.7, 0.7], [0, 1], [-0.7, 0.7], [-1, 0], [-0.7, -0.7], [0, -1], [0.7, -0.7]],
  [[1, 0], [0, 0.8], [-1, 0], [0, -0.8]],
];
function addShape(type, x, y, r, ang) {
  const s = SHP[type], ca = cos(ang), sa = sin(ang);
  for (let k = 0; k < s.length; k++) {
    const vx = s[k][0] * r, vy = s[k][1] * r, px = x + vx * ca - vy * sa, py = y + vx * sa + vy * ca;
    if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
}
function poly(n, x, y, r, a) { for (let k = 0; k < n; k++) { const t = a + (k * TAU) / n; if (k) ctx.lineTo(x + cos(t) * r, y + sin(t) * r); else ctx.moveTo(x + cos(t) * r, y + sin(t) * r); } ctx.closePath(); }
function diamond(x, y, s, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.75, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.75, y); ctx.closePath(); ctx.fill(); }
const worldT = () => ctx.setTransform(K, 0, 0, K, -(cam.x + cam.sx) * K, -(cam.y + cam.sy) * K);
const screenT = () => ctx.setTransform(K, 0, 0, K, 0, 0);
function drawBackground() {
  screenT(); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; ctx.fillStyle = "#050817"; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < NEB.length; i++) { const n = NEB[i]; glow(n[2], n[0] - cam.x * 0.55 - 100, n[1] - cam.y * 0.55 - 200, n[3], 0.11); }
  const F = [0.1, 0.22, 0.45];
  for (let L = 0; L < 3; L++) {
    const ox_ = -(((cam.x + cam.sx) * F[L]) % 512), oy_ = -(((cam.y + cam.sy) * F[L]) % 512); ctx.globalAlpha = 1;
    for (let x = ox_ - (ox_ > 0 ? 512 : 0); x < W; x += 512) for (let y = oy_ - (oy_ > 0 ? 512 : 0); y < H; y += 512) ctx.drawImage(STAR[L], x, y);
  }
  ctx.globalCompositeOperation = "source-over";
  worldT();
  // void outside arena
  ctx.fillStyle = "rgba(1,2,8,0.82)"; ctx.globalAlpha = 1;
  ctx.fillRect(-600, -600, WW + 1200, 600); ctx.fillRect(-600, WH, WW + 1200, 600); ctx.fillRect(-600, 0, 600, WH); ctx.fillRect(WW, 0, 600, WH);
  // grid
  const x0 = Math.floor(cam.x / 100) * 100, y0 = Math.floor(cam.y / 100) * 100;
  ctx.lineWidth = 1; ctx.strokeStyle = "rgba(90,130,255,0.075)"; ctx.beginPath();
  for (let x = Math.max(0, x0); x <= Math.min(WW, cam.x + W + 100); x += 100) { ctx.moveTo(x, Math.max(0, cam.y - 10)); ctx.lineTo(x, Math.min(WH, cam.y + H + 10)); }
  for (let y = Math.max(0, y0); y <= Math.min(WH, cam.y + H + 100); y += 100) { ctx.moveTo(Math.max(0, cam.x - 10), y); ctx.lineTo(Math.min(WW, cam.x + W + 10), y); }
  ctx.stroke();
  // glowing boundary
  ctx.globalCompositeOperation = "lighter";
  const pulse = 0.75 + 0.25 * sin(tG * 2);
  ctx.strokeStyle = "#7a4dff"; ctx.globalAlpha = 0.09 * pulse; ctx.lineWidth = 34; ctx.strokeRect(0, 0, WW, WH);
  ctx.strokeStyle = "#5aa0ff"; ctx.globalAlpha = 0.2 * pulse; ctx.lineWidth = 14; ctx.strokeRect(0, 0, WW, WH);
  ctx.strokeStyle = "#8ff6ff"; ctx.globalAlpha = 0.95; ctx.lineWidth = 3; ctx.strokeRect(0, 0, WW, WH);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
}
const vis = new Int16Array(MAXE + 2); let visN = 0;
function drawIcon(id, x, y, s, col) {
  ctx.save(); ctx.translate(x, y); ctx.lineWidth = Math.max(2, s * 0.13); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineCap = "round"; ctx.lineJoin = "round";
  const a = tG * 1.5;
  switch (id) {
    case "orb": ctx.beginPath(); ctx.arc(0, 0, s * 0.72, 0, TAU); ctx.globalAlpha *= 0.35; ctx.stroke(); ctx.globalAlpha /= 0.35; ctx.beginPath(); ctx.arc(0, 0, s * 0.2, 0, TAU); ctx.fill(); for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(cos(a + i * 2.094) * s * 0.72, sin(a + i * 2.094) * s * 0.72, s * 0.2, 0, TAU); ctx.fill(); } break;
    case "wide": ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(0, 0, s * 0.62, 0.3, 2.6); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, s * 0.62, 3.44, 5.74); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, s * 0.92, 0.6, 2.3); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, s * 0.92, 3.74, 5.44); ctx.stroke(); break;
    case "spin": ctx.beginPath(); ctx.arc(0, 0, s * 0.62, a, a + 4.6); ctx.stroke(); { const e = a + 4.6; ctx.beginPath(); ctx.moveTo(cos(e) * s * 0.62 + cos(e + 1.9) * s * 0.4, sin(e) * s * 0.62 + sin(e + 1.9) * s * 0.4); ctx.lineTo(cos(e) * s * 0.62, sin(e) * s * 0.62); ctx.lineTo(cos(e - 1.2) * s * 0.9, sin(e - 1.2) * s * 0.9); ctx.stroke(); } break;
    case "pow": ctx.beginPath(); for (let i = 0; i < 16; i++) { const r = i & 1 ? s * 0.38 : s * 0.9; const t = (i * TAU) / 16 - PI / 2; if (i) ctx.lineTo(cos(t) * r, sin(t) * r); else ctx.moveTo(cos(t) * r, sin(t) * r); } ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, s * 0.2, 0, TAU); ctx.fill(); break;
    case "shoot": ctx.beginPath(); ctx.arc(-s * 0.4, 0, s * 0.26, 0, TAU); ctx.fill(); for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-s * 0.05, i * s * 0.32); ctx.lineTo(s * 0.85, i * s * 0.5); ctx.stroke(); } break;
    case "zap": ctx.beginPath(); ctx.moveTo(s * 0.2, -s * 0.95); ctx.lineTo(-s * 0.5, s * 0.1); ctx.lineTo(-s * 0.02, s * 0.1); ctx.lineTo(-s * 0.25, s * 0.95); ctx.lineTo(s * 0.55, -s * 0.2); ctx.lineTo(s * 0.05, -s * 0.2); ctx.closePath(); ctx.stroke(); break;
    case "shield": ctx.beginPath(); ctx.moveTo(0, -s * 0.95); ctx.lineTo(s * 0.8, -s * 0.5); ctx.lineTo(s * 0.7, s * 0.3); ctx.lineTo(0, s * 0.95); ctx.lineTo(-s * 0.7, s * 0.3); ctx.lineTo(-s * 0.8, -s * 0.5); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-s * 0.35, s * 0.05); ctx.lineTo(s * 0.35, -s * 0.3); ctx.stroke(); break;
    case "mag": ctx.beginPath(); ctx.arc(0, -s * 0.1, s * 0.6, PI, 0); ctx.lineTo(s * 0.6, s * 0.7); ctx.moveTo(-s * 0.6, -s * 0.1); ctx.lineTo(-s * 0.6, s * 0.7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-s * 0.85, s * 0.72); ctx.lineTo(-s * 0.35, s * 0.72); ctx.moveTo(s * 0.35, s * 0.72); ctx.lineTo(s * 0.85, s * 0.72); ctx.stroke(); break;
    case "dash": for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.moveTo(-s * 0.75 + i * s * 0.6, -s * 0.6); ctx.lineTo(-s * 0.15 + i * s * 0.6, 0); ctx.lineTo(-s * 0.75 + i * s * 0.6, s * 0.6); ctx.stroke(); } break;
    case "vit": ctx.beginPath(); ctx.moveTo(0, s * 0.85); ctx.bezierCurveTo(-s * 1.2, -s * 0.1, -s * 0.5, -s * 0.95, 0, -s * 0.35); ctx.bezierCurveTo(s * 0.5, -s * 0.95, s * 1.2, -s * 0.1, 0, s * 0.85); ctx.closePath(); ctx.stroke(); break;
    case "regen": ctx.beginPath(); ctx.moveTo(-s * 0.7, 0); ctx.lineTo(s * 0.7, 0); ctx.moveTo(0, -s * 0.7); ctx.lineTo(0, s * 0.7); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, s * 0.95, 0, TAU); ctx.globalAlpha *= 0.4; ctx.stroke(); ctx.globalAlpha /= 0.4; break;
    case "heal": ctx.beginPath(); ctx.moveTo(-s * 0.7, 0); ctx.lineTo(s * 0.7, 0); ctx.moveTo(0, -s * 0.7); ctx.lineTo(0, s * 0.7); ctx.stroke(); break;
    case "web": for (let i = 0; i < 5; i++) { const t = (i * TAU) / 5 - PI / 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(cos(t) * s * 0.9, sin(t) * s * 0.9); ctx.stroke(); ctx.beginPath(); ctx.arc(cos(t) * s * 0.9, sin(t) * s * 0.9, s * 0.13, 0, TAU); ctx.fill(); } ctx.beginPath(); poly(5, 0, 0, s * 0.9, -PI / 2); ctx.stroke(); break;
    case "nova": for (let i = 0; i < 3; i++) { const t = -0.5 + i * 0.5; ctx.beginPath(); ctx.moveTo(-s * 0.7, 0); ctx.lineTo(cos(t) * s * 0.95, sin(t) * s * 0.95); ctx.stroke(); ctx.beginPath(); ctx.arc(cos(t) * s * 0.95, sin(t) * s * 0.95, s * 0.12, 0, TAU); ctx.fill(); } ctx.beginPath(); ctx.arc(-s * 0.7, 0, s * 0.22, 0, TAU); ctx.fill(); break;
    case "aegis": ctx.beginPath(); ctx.moveTo(0, -s * 0.95); ctx.lineTo(s * 0.8, -s * 0.5); ctx.lineTo(s * 0.7, s * 0.3); ctx.lineTo(0, s * 0.95); ctx.lineTo(-s * 0.7, s * 0.3); ctx.lineTo(-s * 0.8, -s * 0.5); ctx.closePath(); ctx.stroke(); ctx.beginPath(); for (let i = 0; i < 10; i++) { const r = i & 1 ? s * 0.16 : s * 0.42, t = (i * TAU) / 10 - PI / 2; if (i) ctx.lineTo(cos(t) * r, sin(t) * r); else ctx.moveTo(cos(t) * r, sin(t) * r); } ctx.closePath(); ctx.fill(); break;
    case "sing": ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, TAU); ctx.fillStyle = "#000"; ctx.fill(); ctx.stroke(); for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, s * (0.5 + i * 0.22), a + i * 2, a + i * 2 + 2.4); ctx.stroke(); } break;
    case "blink": ctx.beginPath(); ctx.moveTo(-s * 0.9, s * 0.6); ctx.lineTo(s * 0.9, -s * 0.6); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-s * 0.6, -s * 0.7); ctx.lineTo(s * 0.1, 0); ctx.lineTo(-s * 0.6, s * 0.7); ctx.stroke(); ctx.beginPath(); ctx.arc(s * 0.55, 0, s * 0.18, 0, TAU); ctx.fill(); break;
    case "vamp": ctx.beginPath(); ctx.moveTo(0, -s * 0.95); ctx.bezierCurveTo(s * 0.9, s * 0.1, s * 0.75, s * 0.9, 0, s * 0.9); ctx.bezierCurveTo(-s * 0.75, s * 0.9, -s * 0.9, s * 0.1, 0, -s * 0.95); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.arc(0, s * 0.3, s * 0.2, 0, TAU); ctx.fill(); break;
    default: ctx.beginPath(); ctx.arc(0, 0, s * 0.6, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

// ---------- world rendering ----------
function drawWorldEntities() {
  worldT();
  const vx0 = cam.x - 50, vx1 = cam.x + W + 50, vy0 = cam.y - 50, vy1 = cam.y + H + 50;
  // gems
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < MAXG; i++) {
    const g = GM[i]; if (!g.alive || g.x < vx0 || g.x > vx1 || g.y < vy0 || g.y > vy1) continue;
    const ci = g.kind === 3 ? GR : g.kind === 4 ? PU : g.v >= 10 ? GO : g.v >= 4 ? YE : g.v >= 2 ? GR : CY;
    const pl = 0.75 + 0.25 * sin(tG * 6 + i);
    glow(ci, g.x, g.y, g.kind >= 3 ? 24 : 12 + Math.min(8, g.v), 0.85 * pl);
    ctx.globalAlpha = 1; const s = g.kind >= 3 ? 7 : 4.5 + Math.min(3, g.v * 0.3);
    diamond(g.x, g.y, s, "#ffffff");
    if (g.kind === 3) { ctx.fillStyle = "#5dff8a"; ctx.fillRect(g.x - 8, g.y - 2, 16, 4); ctx.fillRect(g.x - 2, g.y - 8, 4, 16); }
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  // enemies (batched by type)
  visN = 0;
  for (let i = 0; i < MAXE; i++) { const e = E[i]; if (e.alive && e.x > vx0 && e.x < vx1 && e.y > vy0 && e.y < vy1) vis[visN++] = i; }
  ctx.globalCompositeOperation = "lighter";
  for (let j = 0; j < visN; j++) {
    const e = E[vis[j]], col = TD[e.type][5];
    glow(col, e.x, e.y, e.r * 2.7, 0.55);
    if (e.type === DA && e.st === 1) { ctx.globalAlpha = 0.3 + 0.4 * sin(e.t * 30) * sin(e.t * 30); ctx.strokeStyle = "#ffe14a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + e.ax * 300, e.y + e.ay * 300); ctx.stroke(); }
    else if (e.type === SH && e.st === 1) { ctx.globalAlpha = 0.9; ctx.strokeStyle = "#4a8bff"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 4 + e.stT * 30, 0, TAU); ctx.stroke(); }
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  ctx.lineJoin = "round"; ctx.lineWidth = 2.6; ctx.globalAlpha = 1;
  for (let ty = 0; ty < 6; ty++) {
    ctx.beginPath(); let any = false;
    for (let j = 0; j < visN; j++) { const e = E[vis[j]]; if (e.type === ty && e.flash <= 0) { addShape(ty, e.x, e.y, e.r, e.ang); any = true; } }
    if (any) { ctx.fillStyle = "#0a0f2c"; ctx.fill(); ctx.strokeStyle = COLS[TD[ty][5]]; ctx.stroke(); }
  }
  ctx.beginPath(); let anyF = false;
  for (let j = 0; j < visN; j++) { const e = E[vis[j]]; if (e.flash > 0) { addShape(e.type, e.x, e.y, e.r, e.ang); anyF = true; } }
  if (anyF) { ctx.fillStyle = "#ffffff"; ctx.fill(); }
  // bruiser shields + hp, dasher/shooter telegraphs
  ctx.lineCap = "round";
  for (let j = 0; j < visN; j++) {
    const e = E[vis[j]];
    if (e.type === BR) {
      ctx.strokeStyle = "#7fe8ff"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 6, e.ang - 0.95, e.ang + 0.95); ctx.stroke();
      if (e.hp < e.mhp) { ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(e.x - 16, e.y + e.r + 8, 32, 4); ctx.fillStyle = "#ff8a3d"; ctx.fillRect(e.x - 16, e.y + e.r + 8, 32 * Math.max(0, e.hp / e.mhp), 4); }
    }
  }
  ctx.globalAlpha = 1;
  // boss
  if (B.alive) drawBoss();
  // enemy bullets
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < MAXB; i++) {
    const b = EB[i]; if (!b.alive || b.x < vx0 || b.x > vx1 || b.y < vy0 || b.y > vy1) continue;
    glow(b.col, b.x, b.y, b.r * 3.6, 0.95); ctx.globalAlpha = 1; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.6, 0, TAU); ctx.fill();
  }
  for (let i = 0; i < MAXPB; i++) {
    const b = PB[i]; if (!b.alive) continue;
    glow(b.col, b.x, b.y, b.big ? 22 : 15, 0.95); ctx.globalAlpha = 1; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(b.x, b.y, b.big ? 4 : 3, 0, TAU); ctx.fill();
  }
  drawPlayer();
  // particles
  ctx.globalCompositeOperation = "lighter";
  for (let k = 0; k < 10; k++) {
    ctx.fillStyle = COLS[k];
    for (let i = 0; i < MAXP; i++) {
      const p = PT[i]; if (p.life <= 0 || p.c !== k) continue;
      const f = p.life / p.max, s = p.size * (0.35 + 0.65 * f);
      ctx.globalAlpha = f > 0.5 ? 1 : f * 2; ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
  }
  // rings
  for (let i = 0; i < MAXR; i++) {
    const r = RG[i]; if (r.life <= 0) continue;
    const f = r.life / r.max; ctx.globalAlpha = f * r.a; ctx.strokeStyle = COLS[r.c]; ctx.lineWidth = r.w * (0.4 + f); ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  // damage numbers
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (let i = 0; i < MAXN; i++) {
    const n = NUM[i]; if (n.life <= 0) continue;
    ctx.font = fnt(n.size, 800); ctx.globalAlpha = Math.min(1, n.life * 3);
    ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillText(n.txt, n.x + 1, n.y + 1.5); ctx.fillStyle = n.col; ctx.fillText(n.txt, n.x, n.y);
  }
  ctx.globalAlpha = 1;
}
function drawBoss() {
  const col = B.col, r = B.r, x = B.x, y = B.y;
  ctx.globalCompositeOperation = "lighter";
  glow(col, x, y, r * 3.4, 0.55 + 0.15 * sin(tG * 3));
  if (B.type === 1 && B.st === 1) { ctx.globalAlpha = 0.35 + 0.35 * sin(tG * 30) * sin(tG * 30); ctx.strokeStyle = "#ffe14a"; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + B.ax * 700, y + B.ay * 700); ctx.stroke(); ctx.globalAlpha = 1; }
  ctx.globalCompositeOperation = "source-over";
  ctx.lineJoin = "round"; ctx.lineWidth = 5;
  ctx.beginPath(); poly(8, x, y, r, B.ang); ctx.fillStyle = B.flash > 0 ? "#ffffff" : "#0a0f2c"; ctx.fill(); ctx.strokeStyle = COLS[col]; ctx.stroke();
  ctx.lineWidth = 3; ctx.beginPath(); poly(B.type === 1 ? 3 : B.type === 2 ? 6 : 5, x, y, r * 0.66, -B.ang * 1.6); ctx.strokeStyle = COLS[col]; ctx.globalAlpha = 0.85; ctx.stroke(); ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 3; i++) { const a = B.ang * 2 + (i * TAU) / 3; glow(col, x + cos(a) * r * 1.15, y + sin(a) * r * 1.15, 20, 0.9); ctx.globalAlpha = 1; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x + cos(a) * r * 1.15, y + sin(a) * r * 1.15, 4, 0, TAU); ctx.fill(); }
  glow(WT, x, y, r * 0.75, 0.55 + 0.35 * sin(tG * 5)); glow(col, x, y, r * 1.1, 0.9);
  if (B.intro > 0) { ctx.globalAlpha = 0.5 + 0.3 * sin(tG * 20); ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r + 14, 0, TAU); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
}
function drawPlayer() {
  ctx.globalCompositeOperation = "lighter";
  const n = G.n, R_ = G.curR;
  // orbit guide
  ctx.globalAlpha = 0.09 + 0.07 * (G.mult - 1); ctx.strokeStyle = "#8ff6ff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(P.x, P.y, R_, 0, TAU); ctx.stroke();
  // reflect shield
  if (lvOf("shield") && P.shCd <= 0) { ctx.globalAlpha = 0.35 + 0.15 * sin(tG * 5); ctx.strokeStyle = "#3df2ff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(P.x, P.y, R_ + 20, 0, TAU); ctx.stroke(); ctx.globalAlpha = 0.06; ctx.fillStyle = "#3df2ff"; ctx.fill(); }
  // lightning
  const zl = lvOf("zap");
  if (zl && n >= 2) {
    const segs = n === 2 ? 1 : n;
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? "#ffffff" : "#b56bff"; ctx.lineWidth = pass ? 1.6 : 5; ctx.globalAlpha = pass ? 0.95 : 0.5;
      ctx.beginPath();
      for (let i = 0; i < segs; i++) { const j = (i + 1) % n; jag(ox[i], oy[i], ox[j], oy[j]); }
      if (RUN.evo.web) for (let i = 0; i < n; i++) jag(P.x, P.y, ox[i], oy[i]);
      ctx.stroke();
    }
  }
  // trails + orbs
  ctx.lineCap = "round";
  const oc = G.mult > 1.55 ? GO : CY, shooter = lvOf("shoot") > 0;
  for (let i = 0; i < n; i++) {
    for (let k = 1; k < TL; k++) {
      const a = ((thead - k + 1 + TL * 2) % TL), b = ((thead - k + TL * 2) % TL), f = 1 - k / TL;
      ctx.globalAlpha = f * 0.6; ctx.strokeStyle = COLS[oc]; ctx.lineWidth = ORB_R * 1.5 * f;
      ctx.beginPath(); ctx.moveTo(otrail[(i * TL + a) * 2], otrail[(i * TL + a) * 2 + 1]); ctx.lineTo(otrail[(i * TL + b) * 2], otrail[(i * TL + b) * 2 + 1]); ctx.stroke();
    }
  }
  for (let i = 0; i < n; i++) {
    glow(oc, ox[i], oy[i], 32, 1); glow(oc, ox[i], oy[i], 18, 1); ctx.globalAlpha = 1; ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(ox[i], oy[i], ORB_R * 0.62, 0, TAU); ctx.fill();
    ctx.strokeStyle = shooter ? "#5dff8a" : COLS[oc]; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ox[i], oy[i], ORB_R, 0, TAU); ctx.stroke();
  }
  // core
  const blink = P.inv > 0 && P.dashT <= 0 && ((tG * 20) | 0) % 2 === 0;
  ctx.globalAlpha = blink ? 0.35 : 1;
  glow(CY, P.x, P.y, 38 + 4 * sin(tG * 6), 0.9);
  if (P.hitFlash > 0) glow(RD, P.x, P.y, 48, P.hitFlash);
  ctx.globalAlpha = blink ? 0.5 : 1; ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(P.x, P.y, 8, 0, TAU); ctx.fill();
  ctx.strokeStyle = "#8ff6ff"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(P.x, P.y, P.r, 0, TAU); ctx.stroke();
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
}
function jag(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l = hypot(dx, dy) || 1, px = -dy / l, py = dx / l;
  ctx.moveTo(x1, y1);
  for (let k = 1; k < 6; k++) { const t = k / 6, o = (rnd() - 0.5) * 16; ctx.lineTo(x1 + dx * t + px * o, y1 + dy * t + py * o); }
  ctx.lineTo(x2, y2);
}

// ---------- HUD ----------
function fmtTime(t) { const s = Math.floor(t); return ((s / 60) | 0) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60); }
function addBtn(x, y, w, h, fn) { btns.push({ x, y, w, h, fn }); }
function muteBtn(x, y) {
  screenT(); ctx.globalAlpha = 0.8; ctx.strokeStyle = "#9fb4ff"; ctx.fillStyle = "rgba(10,16,44,0.7)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, 17, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 8, y - 3); ctx.lineTo(x - 4, y - 3); ctx.lineTo(x + 1, y - 8); ctx.lineTo(x + 1, y + 8); ctx.lineTo(x - 4, y + 3); ctx.lineTo(x - 8, y + 3); ctx.closePath(); ctx.fillStyle = "#cfe0ff"; ctx.fill();
  ctx.beginPath();
  if (muted) { ctx.moveTo(x + 5, y - 5); ctx.lineTo(x + 12, y + 5); ctx.moveTo(x + 12, y - 5); ctx.lineTo(x + 5, y + 5); ctx.strokeStyle = "#ff6070"; }
  else { ctx.arc(x + 1, y, 7, -0.9, 0.9); ctx.moveTo(x + 1 + cos(0.9) * 11, y + sin(0.9) * 11); ctx.arc(x + 1, y, 11, 0.9, -0.9, true); ctx.strokeStyle = "#cfe0ff"; }
  ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.stroke(); ctx.globalAlpha = 1;
  addBtn(x - 22, y - 22, 44, 44, () => setMute(!muted));
}
function drawHUD() {
  screenT(); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
  // hit vignette
  if (P.hitFlash > 0) { ctx.globalAlpha = P.hitFlash * 0.12; ctx.fillStyle = "#ff2040"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  // XP bar
  ctx.fillStyle = "rgba(255,255,255,0.09)"; ctx.fillRect(0, 0, W, 9);
  const xf = clamp(RUN.xp / RUN.need, 0, 1);
  ctx.fillStyle = "#3df2ff"; ctx.fillRect(0, 0, W * xf, 9);
  ctx.globalCompositeOperation = "lighter"; glow(CY, W * xf, 4, 20, 0.7); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
  // level badge
  rrect(12, 16, 62, 26, 13); ctx.fillStyle = "rgba(12,20,54,0.85)"; ctx.fill(); ctx.strokeStyle = "#3df2ff"; ctx.lineWidth = 2; ctx.stroke();
  txt("LV " + RUN.level, 43, 30, 15, "#c9f8ff", "center", 800);
  // timer + score
  txt(fmtTime(RUN.t), 270, 30, 28, "#ffffff", "center", 800);
  txt("WAVE " + Math.max(1, RUN.wave), 270, 54, 12, "#8b9fd8", "center", 700);
  txt("KILLS", 528, 20, 10, "#8b9fd8", "right", 700); txt(String(RUN.kills), 528, 38, 20, "#ffffff", "right", 800);
  txt("SCORE " + calcScore(), 528, 58, 12, "#8b9fd8", "right", 700);
  // HP bar
  const hf = clamp(P.hp / P.mhp, 0, 1), low = hf < 0.3;
  rrect(12, 52, 220, 18, 9); ctx.fillStyle = "rgba(10,14,36,0.85)"; ctx.fill();
  if (hf > 0) { rrect(12, 52, Math.max(18, 220 * hf), 18, 9); ctx.fillStyle = low ? (((tG * 6) | 0) & 1 ? "#ff3050" : "#ff7080") : "#4dff8f"; ctx.fill(); }
  rrect(12, 52, 220, 18, 9); ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.font = fnt(12, 800); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.75)"; ctx.lineJoin = "round"; const hpt = Math.ceil(P.hp) + " / " + Math.ceil(P.mhp); ctx.strokeText(hpt, 122, 61.5); ctx.fillStyle = "#fff"; ctx.fillText(hpt, 122, 61.5);
  // orbit bonus
  const mcol = G.mult > 1.55 ? "#ffd35a" : "#8ff6ff";
  txt("ORBIT  x" + G.mult.toFixed(2), 14, 86, 12, mcol, "left", 800);
  if (lvOf("shield")) { txt(P.shCd <= 0 ? "SHIELD READY" : "SHIELD " + Math.ceil(P.shCd) + "s", 130, 86, 11, P.shCd <= 0 ? "#3df2ff" : "#5a6a9a", "left", 800); }
  // buttons
  muteBtn(500, 100);
  screenT(); ctx.globalAlpha = 0.8; ctx.fillStyle = "rgba(10,16,44,0.7)"; ctx.strokeStyle = "#9fb4ff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(456, 100, 17, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#cfe0ff"; ctx.fillRect(450, 92, 4.5, 16); ctx.fillRect(459, 92, 4.5, 16); ctx.globalAlpha = 1;
  addBtn(434, 78, 44, 44, () => { if (state === "play") paused = true; });
  // boss bar
  if (B.alive) {
    const bx = 70, bw = 400, by = 122, f = clamp(B.hp / B.mhp, 0, 1);
    txt(B.name, 270, by - 8, 14, COLS[B.col], "center", 800);
    rrect(bx, by, bw, 14, 7); ctx.fillStyle = "rgba(10,14,36,0.85)"; ctx.fill();
    if (f > 0) { rrect(bx, by, Math.max(14, bw * f), 14, 7); ctx.fillStyle = COLS[B.col]; ctx.fill(); }
    rrect(bx, by, bw, 14, 7); ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.lineWidth = 1.5; ctx.stroke();
    if (B.intro > 0) txt("INCOMING", 270, by + 7.5, 10, "#fff", "center", 800);
  }
  // dash button
  if (lvOf("dash")) {
    const cx = 476, cy = 868, r = 36, rdy = P.dashCd <= 0;
    ctx.globalAlpha = 0.9; ctx.fillStyle = "rgba(10,16,44,0.78)"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = rdy ? "#ff3d9a" : "#3a4470"; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    if (!rdy) { ctx.strokeStyle = "#ff3d9a"; ctx.beginPath(); ctx.arc(cx, cy, r, -PI / 2, -PI / 2 + TAU * (1 - P.dashCd / G.dashCdMax)); ctx.stroke(); }
    ctx.globalAlpha = rdy ? 1 : 0.5; drawIcon("dash", cx, cy - 3, 15, rdy ? "#ffb0dc" : "#7a86b8"); txt("DASH", cx, cy + 22, 10, rdy ? "#ff8ac4" : "#6a76a8", "center", 800);
    ctx.globalAlpha = 1; addBtn(cx - 44, cy - 44, 88, 88, requestDash);
  }
  // joystick
  if (inp.down && state === "play" && !botOn) {
    ctx.globalAlpha = 0.18; ctx.strokeStyle = "#8ff6ff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(inp.ax, inp.ay, 64, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.35; ctx.fillStyle = "#8ff6ff"; const l = hypot(inp.px - inp.ax, inp.py - inp.ay), m = Math.min(64, l), kx = l > 0 ? inp.ax + ((inp.px - inp.ax) / l) * m : inp.ax, ky = l > 0 ? inp.ay + ((inp.py - inp.ay) / l) * m : inp.ay;
    ctx.beginPath(); ctx.arc(kx, ky, 24, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  }
  // banner
  if (RUN.bannerT > 0) {
    const a = Math.min(1, RUN.bannerT * 2, (2.6 - RUN.bannerT + 0.05) * 3), big = RUN.banner === "WARNING";
    ctx.save(); ctx.shadowColor = big ? "#ff4055" : "#3df2ff"; ctx.shadowBlur = 24;
    txt(RUN.banner, 270, 250, big ? 52 : 44, big ? "#ff6070" : "#ffffff", "center", 900, clamp(a, 0, 1)); ctx.restore();
    if (RUN.bannerSub) txt(RUN.bannerSub, 270, 292, 18, "#b8c8ff", "center", 700, clamp(a, 0, 1));
  }
  // tutorial hints
  if (RUN.tut && RUN.t < 22 && state === "play") {
    const t = RUN.t; let l1 = "", l2 = "";
    if (t < 6.5) { l1 = "DRAG ANYWHERE TO MOVE"; l2 = "Your orbs attack automatically"; }
    else if (t < 13) { l1 = "COLLECT GEMS TO LEVEL UP"; l2 = "Pick an upgrade every level"; }
    else { l1 = "TIGHT ORBIT = MORE DAMAGE"; l2 = "Stand still to tighten it, but it is riskier"; }
    const seg = t < 6.5 ? t : t < 13 ? t - 6.5 : t - 13, a = clamp(Math.min(seg * 2, (6.5 - seg) * 2), 0, 1) * 0.95;
    rrect(50, 760, 440, 74, 18); ctx.globalAlpha = a * 0.75; ctx.fillStyle = "#070c26"; ctx.fill(); ctx.strokeStyle = "#3df2ff"; ctx.lineWidth = 2; ctx.globalAlpha = a * 0.7; ctx.stroke();
    txt(l1, 270, 786, 20, "#ffffff", "center", 800, a); txt(l2, 270, 815, 14, "#a9c2ff", "center", 600, a);
  }
  ctx.globalAlpha = 1;
}

// ---------- menus ----------
let cardLines = [[], [], []];
function wrap(s, maxW, size) {
  ctx.font = fnt(size, 500); const words = s.split(" "), out = []; let line = "";
  for (const w of words) { const t = line ? line + " " + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
  if (line) out.push(line); return out;
}
function prepCards() { for (let i = 0; i < 3; i++) { const u = cards[i]; if (!u) continue; cardLines[i] = wrap(typeof u.desc === "function" ? u.desc(lvOf(u.id)) : u.desc, 296, 15); } }
function bigButton(x, y, w, h, label, col, fn, pulse) {
  screenT(); const s = pulse ? 1 + 0.025 * sin(tG * 4) : 1, bw = w * s, bh = h * s;
  ctx.globalCompositeOperation = "lighter"; glow(col, x, y, bw * 0.62, pulse ? 0.28 : 0.15); ctx.globalCompositeOperation = "source-over";
  rrect(x - bw / 2, y - bh / 2, bw, bh, bh / 2); const gr = ctx.createLinearGradient(0, y - bh / 2, 0, y + bh / 2); gr.addColorStop(0, hexA(COLS[col], 0.34)); gr.addColorStop(1, hexA(COLS[col], 0.1));
  ctx.globalAlpha = 1; ctx.fillStyle = gr; ctx.fill(); ctx.strokeStyle = COLS[col]; ctx.lineWidth = 3; ctx.stroke();
  txt(label, x, y + 1, Math.round(bh * 0.4), "#ffffff", "center", 800);
  addBtn(x - w / 2, y - h / 2, w, h, fn);
}
function drawTitle() {
  worldT(); ctx.globalCompositeOperation = "lighter";
  for (let k = 0; k < 10; k++) { ctx.fillStyle = COLS[k]; for (let i = 0; i < MAXP; i++) { const p = PT[i]; if (p.life <= 0 || p.c !== k) continue; const f = p.life / p.max; ctx.globalAlpha = Math.min(1, f * 2) * 0.8; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); } }
  for (let i = 0; i < MAXR; i++) { const r = RG[i]; if (r.life <= 0) continue; const f = r.life / r.max; ctx.globalAlpha = f * r.a; ctx.strokeStyle = COLS[r.c]; ctx.lineWidth = r.w * (0.4 + f); ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; screenT();
  // demo: core + orbs + incoming enemies
  const cx = 270, cy = 500;
  ctx.lineJoin = "round"; ctx.lineWidth = 2.6;
  for (let i = 0; i < demo.length; i++) { const e = demo[i], x = cx + cos(e.a) * e.d, y = cy + sin(e.a) * e.d; ctx.beginPath(); addShape(e.type, x, y, 11, e.a + PI); ctx.fillStyle = "#0a0f2c"; ctx.fill(); ctx.strokeStyle = COLS[TD[e.type][5]]; ctx.stroke(); ctx.globalCompositeOperation = "lighter"; glow(TD[e.type][5], x, y, 30, 0.55); ctx.globalCompositeOperation = "source-over"; }
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.14; ctx.strokeStyle = "#8ff6ff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, 62, 0, TAU); ctx.stroke();
  for (let i = 0; i < 3; i++) {
    const a = phase + (i * TAU) / 3;
    for (let k = 1; k < 10; k++) { const b = a - k * 0.075; ctx.globalAlpha = (1 - k / 10) * 0.6; ctx.strokeStyle = "#3df2ff"; ctx.lineWidth = 12 * (1 - k / 10); ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(cx + cos(b + 0.075) * 62, cy + sin(b + 0.075) * 62); ctx.lineTo(cx + cos(b) * 62, cy + sin(b) * 62); ctx.stroke(); }
    glow(CY, cx + cos(a) * 62, cy + sin(a) * 62, 25, 0.95); ctx.globalAlpha = 1; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx + cos(a) * 62, cy + sin(a) * 62, 5.5, 0, TAU); ctx.fill();
  }
  glow(CY, cx, cy, 40, 0.9); ctx.globalAlpha = 1; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx, cy, 8, 0, TAU); ctx.fill(); ctx.strokeStyle = "#8ff6ff"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, 13, 0, TAU); ctx.stroke();
  // logo orbit ellipse
  ctx.save(); ctx.translate(270, 178); ctx.rotate(-0.1);
  ctx.globalAlpha = 0.22; ctx.strokeStyle = "#3df2ff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, 0, 236, 58, 0, 0, TAU); ctx.stroke();
  for (let i = 0; i < 3; i++) { const a = tG * 1.3 + (i * TAU) / 3, x = cos(a) * 236, y = sin(a) * 58; if (sin(a) < 0 && i !== 9) { } glow(i === 1 ? MG : i === 2 ? YE : CY, x, y, 20, 0.95); ctx.globalAlpha = 1; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, TAU); ctx.fill(); }
  ctx.restore();
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  // logo text
  ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.shadowColor = "#3df2ff"; ctx.shadowBlur = 34; ctx.font = fnt(98, 900);
  const g1 = ctx.createLinearGradient(0, 130, 0, 230); g1.addColorStop(0, "#ffffff"); g1.addColorStop(0.5, "#aef6ff"); g1.addColorStop(1, "#3d9bff");
  ctx.fillStyle = g1; ctx.fillText("ORBIT", 270, 176);
  ctx.shadowBlur = 0; ctx.fillStyle = "#ffffff"; ctx.globalAlpha = 0.9; ctx.fillText("ORBIT", 270, 176); ctx.globalAlpha = 1;
  ctx.shadowColor = "#ff3d9a"; ctx.shadowBlur = 26; ctx.font = fnt(50, 900); if ("letterSpacing" in ctx) ctx.letterSpacing = "7px";
  const g2 = ctx.createLinearGradient(0, 245, 0, 290); g2.addColorStop(0, "#ff8ac4"); g2.addColorStop(1, "#ff3d9a");
  ctx.fillStyle = g2; ctx.fillText("SURVIVORS", 274, 266);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  ctx.restore();
  txt("Drag to move. Orbs fight for you.", 270, 620, 17, "#a9c2ff", "center", 600);
  bigButton(270, 705, 330, 82, "PLAY", CY, startRun, true);
  bigButton(270, 800, 330, 58, "UPGRADES", GO, () => { state = "meta"; sfx("click"); }, false);
  diamond(146, 800, 8, "#ffd35a"); txt(String(meta.shards), 160, 801, 16, "#ffd35a", "left", 800);
  const b = getBest();
  txt(b ? "BEST  " + b : "Survive. Level up. Evolve.", 270, 880, 17, "#8b9fd8", "center", 700);
  txt("WASD / arrows / drag   |   Space or double-tap: dash", 270, 918, 12, "#5a6a9a", "center", 600);
  muteBtn(502, 38);
}
const META = [
  { id: "vit", name: "Reinforced Core", desc: "+12 starting max HP per level", max: 5, cost: [30, 55, 90, 140, 200] },
  { id: "pow", name: "Sharper Orbs", desc: "+6% orb damage per level", max: 5, cost: [40, 70, 110, 170, 250] },
  { id: "xp", name: "Fast Learner", desc: "+8% XP from gems per level", max: 5, cost: [35, 60, 100, 150, 220] },
  { id: "mag", name: "Gravity Well", desc: "+12% gem pickup range per level", max: 4, cost: [25, 45, 80, 130] },
  { id: "spd", name: "Ion Thrusters", desc: "+4% move speed per level", max: 4, cost: [30, 55, 95, 150] },
  { id: "orb", name: "Third Orb", desc: "Start every run with one extra orb", max: 1, cost: [260] },
  { id: "dash", name: "Dash Module", desc: "Start every run with Phase Dash", max: 1, cost: [180] },
  { id: "rev", name: "Second Chance", desc: "Revive once per run at half HP", max: 1, cost: [400] },
];
function drawMeta() {
  screenT(); ctx.globalAlpha = 0.94; ctx.fillStyle = "#040616"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
  txt("PERMANENT UPGRADES", 270, 50, 28, "#ffffff", "center", 900);
  diamond(228, 92, 9, "#ffd35a"); txt(meta.shards + " SHARDS", 244, 92, 20, "#ffd35a", "left", 800);
  for (let i = 0; i < META.length; i++) {
    const m = META[i], y = 130 + i * 84, lv = ml(m.id), maxed = lv >= m.max, cost = maxed ? 0 : m.cost[lv], can = !maxed && meta.shards >= cost;
    rrect(22, y, 496, 74, 16); ctx.fillStyle = "rgba(14,22,58,0.88)"; ctx.fill(); ctx.strokeStyle = maxed ? "#ffd35a" : can ? "#3df2ff" : "rgba(120,140,220,0.35)"; ctx.lineWidth = 2; ctx.stroke();
    txt(m.name, 42, y + 25, 19, "#ffffff", "left", 800);
    if (m.max > 1) for (let k = 0; k < m.max; k++) { ctx.fillStyle = k < lv ? "#ffd35a" : "rgba(160,180,255,0.25)"; ctx.fillRect(388 - (m.max - k) * 16, y + 22, 12, 6); }
    txt(m.desc, 42, y + 54, 13, "#8b9fd8", "left", 600);
    if (maxed) txt("MAX", 470, y + 37, 18, "#ffd35a", "center", 900);
    else {
      rrect(398, y + 15, 108, 44, 22); ctx.fillStyle = can ? "rgba(61,242,255,0.22)" : "rgba(80,90,140,0.2)"; ctx.fill(); ctx.strokeStyle = can ? "#3df2ff" : "#4a5686"; ctx.lineWidth = 2; ctx.stroke();
      diamond(422, y + 37, 7, can ? "#ffd35a" : "#6a6f90"); txt(String(cost), 436, y + 38, 18, can ? "#ffffff" : "#7c86b0", "left", 800);
      addBtn(398, y + 10, 118, 54, () => { if (can) { meta.shards -= cost; meta.lv[m.id] = lv + 1; saveMeta(); sfx("buy"); ring(420, y + 37, 50, 0.4, GO, 3); } else sfx("deny"); });
    }
  }
  bigButton(270, 895, 240, 56, "BACK", CY, () => { state = "title"; sfx("click"); }, false);
}
function drawCards() {
  screenT(); ctx.globalAlpha = 0.74; ctx.fillStyle = "#03050f"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
  const hd = Math.min(1, cardT * 4);
  ctx.save(); ctx.shadowColor = "#ffd35a"; ctx.shadowBlur = 24; txt("LEVEL UP!", 270, 118, 54, "#ffe9a0", "center", 900, hd); ctx.restore();
  txt("Level " + RUN.level + "  -  choose an upgrade", 270, 168, 18, "#a9c2ff", "center", 700, hd);
  if (RUN.pending > 1) txt("+" + (RUN.pending - 1) + " more waiting", 270, 194, 13, "#ffd35a", "center", 700, hd);
  for (let i = 0; i < 3; i++) {
    const u = cards[i]; if (!u) continue;
    const t = clamp((cardT - i * 0.09) / 0.28, 0, 1), e = 1 - Math.pow(1 - t, 3), x = 40 + (1 - e) * 560, y = 222 + i * 172, w = 460, h = 156, evo = !!u.evo, col = COLS[u.col];
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "lighter"; glow(evo ? GO : u.col, x + 230, y + 78, 300, evo ? 0.16 + 0.06 * sin(tG * 5) : 0.08); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    rrect(x, y, w, h, 22); const gr = ctx.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, "rgba(22,32,84,0.97)"); gr.addColorStop(1, "rgba(9,14,44,0.97)"); ctx.fillStyle = gr; ctx.fill();
    ctx.strokeStyle = evo ? "#ffd35a" : col; ctx.lineWidth = evo ? 4 : 2.5; ctx.stroke();
    // icon plate
    ctx.globalCompositeOperation = "lighter"; glow(evo ? GO : u.col, x + 74, y + 78, 62, 0.55); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(x + 74, y + 78, 44, 0, TAU); ctx.fillStyle = "rgba(5,8,28,0.85)"; ctx.fill(); ctx.strokeStyle = evo ? "#ffd35a" : col; ctx.lineWidth = 2.5; ctx.stroke();
    drawIcon(u.id, x + 74, y + 78, 26, evo ? "#ffe9a0" : col);
    const lvl = lvOf(u.id);
    txt(u.name, x + 138, y + 36, 24, "#ffffff", "left", 800);
    let tag, tcol;
    if (evo) { tag = "EVOLUTION"; tcol = "#ffd35a"; } else if (u.heal) { tag = "INSTANT"; tcol = "#5dff8a"; } else if (lvl === 0) { tag = "NEW"; tcol = "#5dff8a"; } else { tag = "LEVEL " + lvl + " > " + (lvl + 1); tcol = col; }
    txt(tag, x + 138, y + 62, 13, tcol, "left", 800);
    const ls = cardLines[i] || [];
    for (let k = 0; k < ls.length && k < 3; k++) txt(ls[k], x + 138, y + 88 + k * 20, 15, "#b9c6ee", "left", 500);
    // number key
    txt(String(i + 1), x + w - 22, y + 24, 14, "rgba(160,180,255,0.5)", "center", 800);
    if (t >= 1 && cardT > 0.35) addBtn(x, y, w, h, () => chooseCard(i));
  }
  // build chips
  const items = []; for (const u of UPG) if (lvOf(u.id)) items.push(u); for (const u of EVO) if (RUN.evo[u.id]) items.push(u);
  if (items.length) {
    txt("YOUR BUILD", 270, 762, 12, "#6f80b8", "center", 800);
    for (let i = 0; i < items.length; i++) { const u = items[i], row = (i / 9) | 0, col = i % 9, cnt = Math.min(9, items.length - row * 9), x = 270 + (col - (cnt - 1) / 2) * 52, y = 800 + row * 56;
      ctx.beginPath(); ctx.arc(x, y, 21, 0, TAU); ctx.fillStyle = "rgba(10,16,44,0.9)"; ctx.fill(); ctx.strokeStyle = COLS[u.col]; ctx.lineWidth = 2; ctx.stroke();
      drawIcon(u.id, x, y, 11, COLS[u.col]); txt(u.evo ? "*" : String(lvOf(u.id)), x + 14, y + 15, 12, "#fff", "center", 800); }
  }
  txt("Tap a card or press 1 / 2 / 3", 270, 930, 13, "#5a6a9a", "center", 600);
}
function drawOver() {
  screenT(); const a = clamp(overT * 2.2, 0, 1); ctx.globalAlpha = 0.78 * a; ctx.fillStyle = "#03050f"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
  const A = a;
  ctx.save(); ctx.shadowColor = "#ff4055"; ctx.shadowBlur = 26; txt("RUN OVER", 270, 96, 54, "#ff6d7d", "center", 900, A); ctx.restore();
  txt("SCORE", 270, 160, 14, "#8b9fd8", "center", 800, A);
  const sc = Math.floor(RUN.score * Math.min(1, overT * 0.9));
  ctx.save(); ctx.shadowColor = "#3df2ff"; ctx.shadowBlur = 22; txt(String(sc), 270, 206, 62, "#ffffff", "center", 900, A); ctx.restore();
  if (RUN.newBest) { ctx.save(); ctx.shadowColor = "#ffd35a"; ctx.shadowBlur = 16; txt("NEW BEST!", 270, 256, 24, "#ffd35a", "center", 900, A * (0.75 + 0.25 * sin(tG * 8))); ctx.restore(); }
  else txt("Best  " + getBest(), 270, 254, 17, "#8b9fd8", "center", 700, A);
  const stats = [["TIME", fmtTime(RUN.t)], ["KILLS", String(RUN.kills)], ["LEVEL", String(RUN.level)], ["BOSSES", String(RUN.bossKills)]];
  rrect(30, 290, 480, 84, 18); ctx.globalAlpha = 0.85 * A; ctx.fillStyle = "rgba(14,22,58,0.9)"; ctx.fill(); ctx.strokeStyle = "rgba(120,150,255,0.4)"; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
  for (let i = 0; i < 4; i++) { const x = 30 + 60 + i * 120; txt(stats[i][0], x, 315, 12, "#8b9fd8", "center", 800, A); txt(stats[i][1], x, 348, 30, "#ffffff", "center", 900, A); }
  txt("YOUR BUILD", 270, 412, 13, "#6f80b8", "center", 800, A);
  const items = []; for (const u of UPG) if (lvOf(u.id)) items.push(u); for (const u of EVO) if (RUN.evo[u.id]) items.push(u);
  if (!items.length) txt("No upgrades this run", 270, 470, 16, "#5a6a9a", "center", 600, A);
  for (let i = 0; i < items.length; i++) { const u = items[i], row = (i / 6) | 0, col = i % 6, cnt = Math.min(6, items.length - row * 6), x = 270 + (col - (cnt - 1) / 2) * 76, y = 462 + row * 84;
    ctx.globalAlpha = A; ctx.beginPath(); ctx.arc(x, y, 27, 0, TAU); ctx.fillStyle = "rgba(10,16,44,0.92)"; ctx.fill(); ctx.strokeStyle = u.evo ? "#ffd35a" : COLS[u.col]; ctx.lineWidth = u.evo ? 3.5 : 2.5; ctx.stroke();
    drawIcon(u.id, x, y, 14, u.evo ? "#ffe9a0" : COLS[u.col]); txt(u.evo ? "EVO" : "LV " + lvOf(u.id), x, y + 40, 11, u.evo ? "#ffd35a" : "#a9c2ff", "center", 800, A); }
  diamond(212, 640, 9, "#ffd35a"); txt("+" + RUN.shards + " SHARDS", 230, 640, 22, "#ffd35a", "left", 900, A);
  txt("Total " + meta.shards + " - spend them in Upgrades", 270, 674, 13, "#8b9fd8", "center", 600, A);
  if (overT > 0.4) {
    bigButton(270, 750, 340, 78, "PLAY AGAIN", CY, startRun, true);
    bigButton(270, 836, 340, 56, "UPGRADES", GO, () => { state = "meta"; sfx("click"); }, false);
    bigButton(270, 902, 200, 44, "MENU", PU, () => { state = "title"; sfx("click"); }, false);
  }
}
function drawPause() {
  screenT(); ctx.globalAlpha = 0.65; ctx.fillStyle = "#03050f"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
  ctx.save(); ctx.shadowColor = "#3df2ff"; ctx.shadowBlur = 22; txt("PAUSED", 270, 400, 60, "#ffffff", "center", 900); ctx.restore();
  txt("Tap anywhere to resume", 270, 470, 18, "#a9c2ff", "center", 600);
  bigButton(270, 570, 260, 60, "QUIT RUN", MG, () => { paused = false; state = "title"; }, false);
  addBtn(0, 0, W, H, () => { paused = false; try { SFXo.resume(); } catch (e) {} });
  // ensure the quit button (added first) wins hit-testing over full-screen resume
  const q = btns.splice(btns.length - 2, 1)[0]; btns.push(q);
}

// ---------- main render ----------
function render() {
  ctx.setTransform(K, 0, 0, K, 0, 0); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
  btns.length = 0;
  drawBackground();
  if (state === "title" || state === "meta") {
    drawTitle();
    screenT(); ctx.drawImage(VIG, 0, 0, W, H);
    if (state === "meta") { btns.length = 0; drawMeta(); }
    return;
  }
  drawWorldEntities();
  screenT(); ctx.drawImage(VIG, 0, 0, W, H);
  if (state === "play" || state === "dying") drawHUD();
  if (state === "levelup") drawCards();
  else if (state === "over") drawOver();
  if (paused && state === "play") drawPause();
}

// ---------- loop ----------
let last = 0, fAcc = 0;
const perf = { n: 0, sum: 0, max: 0, upd: 0, ren: 0, buf: [] };
function loop(ts) {
  requestAnimationFrame(loop);
  let dt = (ts - last) / 1000; last = ts; if (!(dt > 0)) dt = 1 / 60; if (dt > 0.05) dt = 0.05;
  const t0 = performance.now();
  if (!paused) update(dt);
  const t1 = performance.now();
  render();
  const t2 = performance.now();
  if (DEBUG) { perf.n++; perf.upd += t1 - t0; perf.ren += t2 - t1; const tot = t2 - t0; perf.sum += tot; if (tot > perf.max) perf.max = tot; if (perf.buf.length < 4000) perf.buf.push(tot); }
}
requestAnimationFrame(loop);

if (DEBUG) {
  const ff = (sec) => { const steps = Math.round(sec * 30); for (let i = 0; i < steps; i++) { if (state === "levelup") { if (botOn) { cardT = 1; chooseCard((rnd() * 3) | 0); } else break; } if (state === "dying") { deathT += 1 / 30; if (deathT > 1.5) { state = "over"; overT = 0; } continue; } if (state !== "play") break; RUN.slowT > 0 && (RUN.slowT -= 1 / 30, RUN.slowT <= 0 && (timeScale = 1)); stepGame((1 / 30) * timeScale); } };
  window.__os = {
    ff, P, RUN, G, B, cam,
    get state() { return state; },
    set state(v) { state = v; },
    start: startRun,
    setBot(v) { botOn = !!v; }, setGod(v) { god = !!v; },
    stats() { return { state, t: RUN.t, kills: RUN.kills, level: RUN.level, hp: P.hp, mhp: P.mhp, enemies: enemyCount, boss: B.alive, bossKills: RUN.bossKills, wave: RUN.wave, lv: RUN.lv, evo: RUN.evo, n: G.n, pending: RUN.pending, score: calcScore(), shards: meta.shards, particles: PT.filter((p) => p.life > 0).length, bullets: EB.filter((b) => b.alive).length }; },
    spawnBoss(i) { spawnBoss(i == null ? RUN.bossIdx : i); },
    killBoss() { if (B.alive) { B.intro = 0; hurtBoss(1e9, false); } },
    spawnMany(n, type) { for (let i = 0; i < n; i++) { edgePos(_p); spawnEnemy(type == null ? (rnd() * 6) | 0 : type, _p[0], _p[1]); } },
    swarm(n) { for (let i = 0; i < n; i++) { const a = rnd() * TAU, d = 120 + rnd() * 320; spawnEnemy((rnd() * 6) | 0, clamp(P.x + cos(a) * d, 30, WW - 30), clamp(P.y + sin(a) * d, 30, WH - 30)); } },
    addXP(n) { addXP(n); }, upgrade(id, n) { for (let i = 0; i < (n || 1); i++) { const u = UBY[id]; if (u) applyCard(u); } },
    pick(i) { cardT = 1; chooseCard(i); }, cards() { return cards.map((c) => c && c.id); },
    setTime(t) { RUN.t = t; }, hurt(d) { hurtPlayer(d, P.x, P.y); }, die() { P.hp = 0; die(); },
    get perf() { return perf; }, resetPerf() { perf.n = perf.sum = perf.max = perf.upd = perf.ren = 0; perf.buf.length = 0; },
    meta, saveMeta, dash: requestDash, pause(v) { paused = v; },
  };
}
})();
