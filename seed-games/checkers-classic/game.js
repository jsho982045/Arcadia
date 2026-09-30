// Checkers Classic — an Arcadia seed game. English/American draughts vs the computer or a friend.
(() => {
  "use strict";
  const E = window.CheckersEngine;
  const W = 540, H = 860, N = 8, CELL = 60, OX = 30, OY = 186, R = CELL * 0.4, FRAME = 22;
  const BLACK = E.BLACK, RED = E.RED;
  const GOLD = "#f4c95d", CREAM = "#f6e7c8";
  const c = document.getElementById("c");
  const ctx = c.getContext("2d");
  function fit() {
    const s = Math.min(innerWidth / W, innerHeight / H), d = window.devicePixelRatio || 1;
    c.style.width = W * s + "px"; c.style.height = H * s + "px";
    c.width = Math.round(W * s * d); c.height = Math.round(H * s * d);
    ctx.setTransform(s * d, 0, 0, s * d, 0, 0);
  }
  addEventListener("resize", fit); fit();

  // ---------- storage (Arcadia shim or plain localStorage; always guarded) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("checkers." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("checkers." + k, JSON.stringify(v)); } catch (e) {} },
  };
  let cfg = Object.assign({ mode: "ai", human: BLACK, level: 1, sound: true }, store.get("cfg", {}));
  let stats = Object.assign({ wins: [0, 0, 0, 0], best: [0, 0, 0, 0] }, store.get("stats", {}));
  const saveCfg = () => store.set("cfg", cfg), saveStats = () => store.set("stats", stats);

  // ---------- state ----------
  let scr = "menu", paused = false, t = 0;
  let st, legal = [], hashes = [], undoStack = [], lastMove = null, sprites = [], humanMoves = 0;
  let over = null, overAt = 0, submitted = false, flip = false;
  let sel = null, partial = null, thinking = false, cancelThink = null, busy = 0, drag = null, kc = null;
  let tweens = [], particles = [], confetti = [], popups = [], rings = [];
  let flashText = "", flashT = 0, shakeT = 0, pulseT = 0, restartArmed = 0, gameStarted = false;

  // ---------- helpers ----------
  const rnd = (a, b) => a + Math.random() * (b - a);
  const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  const easeOutBack = (k) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
  function tween(dur, fn, ease) {
    return new Promise((res) => tweens.push({ t: 0, dur, fn, res, ease: ease || easeInOut }));
  }
  // engine square -> canvas px (center)
  function sqPx(x, y) { // x = col, y = row (floats, engine space)
    const vx = flip ? 7 - x : x, vy = flip ? 7 - y : y;
    return { x: OX + (vx + 0.5) * CELL, y: OY + (vy + 0.5) * CELL };
  }
  function pxSq(px, py) {
    const vc = Math.floor((px - OX) / CELL), vr = Math.floor((py - OY) / CELL);
    if (vc < 0 || vr < 0 || vc > 7 || vr > 7) return -1;
    return flip ? (7 - vr) * 8 + (7 - vc) : vr * 8 + vc;
  }
  const humanSide = () => cfg.human;
  const bottomSide = () => (flip ? BLACK : RED);
  const sideName = (s) => (s === BLACK ? "Black" : "Red");

  // ---------- sound ----------
  let actx = null;
  function beep(freq, dur, type, vol, slideTo, delay) {
    if (!cfg.sound) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      const t0 = actx.currentTime + (delay || 0), o = actx.createOscillator(), g = actx.createGain();
      o.type = type || "sine"; o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      g.gain.setValueAtTime(vol || 0.08, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(actx.destination); o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) {}
  }
  const sfx = {
    move() { beep(300, 0.09, "triangle", 0.1, 180); },
    hop() { beep(520, 0.1, "square", 0.05, 260); },
    capture() { beep(200, 0.16, "sawtooth", 0.07, 70); beep(760, 0.08, "triangle", 0.05, 380, 0.03); },
    king() { [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.18, "triangle", 0.08, 0, i * 0.07)); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => beep(f, 0.3, "triangle", 0.09, 0, i * 0.11)); },
    lose() { [392, 330, 262].forEach((f, i) => beep(f, 0.3, "sine", 0.09, 0, i * 0.16)); },
    bad() { beep(140, 0.16, "square", 0.05, 90); },
    tick() { beep(660, 0.05, "sine", 0.05); },
  };

  // ---------- board image (procedural wood) ----------
  function mulberry(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
  function woodRect(g, x, y, w, h, base, dark, light, rand, lines, amp, vertical) {
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    const bg = g.createLinearGradient(x, y, x + (vertical ? w : 0), y + (vertical ? 0 : h));
    bg.addColorStop(0, base[0]); bg.addColorStop(1, base[1]); g.fillStyle = bg; g.fillRect(x, y, w, h);
    for (let i = 0; i < lines; i++) {
      const p = rand() * 6.28, f = 0.015 + rand() * 0.035, a = amp * (0.4 + rand() * 0.9), off = ((i + rand()) / lines) * (vertical ? w : h);
      g.beginPath();
      const len = vertical ? h : w;
      for (let s = -4; s <= len + 4; s += 4) {
        const wob = Math.sin(s * f + p) * a + Math.sin(s * f * 2.7 + p * 1.7) * a * 0.3;
        if (vertical) g.lineTo(x + off + wob, y + s); else g.lineTo(x + s, y + off + wob);
      }
      g.lineWidth = 0.4 + rand() * 1.4;
      g.strokeStyle = rand() < 0.75 ? `rgba(${dark},${0.05 + rand() * 0.14})` : `rgba(${light},${0.05 + rand() * 0.1})`;
      g.stroke();
    }
    if (rand() < 0.22) { // a knot
      const kx = x + rand() * w, ky = y + rand() * h;
      for (let k = 5; k >= 1; k--) { g.beginPath(); g.ellipse(kx, ky, k * 3.2, k * 1.7, 0, 0, 6.28); g.strokeStyle = `rgba(${dark},${0.05 + (5 - k) * 0.03})`; g.lineWidth = 0.8; g.stroke(); }
    }
    g.restore();
  }
  let boardImg = null;
  function makeBoard() {
    const S = 2, BW = N * CELL, T = BW + FRAME * 2;
    const cv = document.createElement("canvas"); cv.width = T * S; cv.height = T * S;
    const g = cv.getContext("2d"); g.scale(S, S);
    const rand = mulberry(7);
    // frame
    g.save(); g.beginPath(); g.roundRect(0, 0, T, T, 18); g.clip();
    woodRect(g, 0, 0, T, T, ["#6b4426", "#3f2612"], "20,10,2", "255,200,140", rand, 70, 2.2, false);
    g.restore();
    g.lineWidth = 2; g.strokeStyle = "rgba(255,225,170,.35)"; g.beginPath(); g.roundRect(1.5, 1.5, T - 3, T - 3, 17); g.stroke();
    g.strokeStyle = "rgba(0,0,0,.55)"; g.beginPath(); g.roundRect(3.5, 3.5, T - 7, T - 7, 15); g.stroke();
    g.strokeStyle = "rgba(244,201,93,.5)"; g.lineWidth = 1.2; g.strokeRect(FRAME - 5, FRAME - 5, BW + 10, BW + 10);
    // squares
    for (let r = 0; r < N; r++) for (let col = 0; col < N; col++) {
      const x = FRAME + col * CELL, y = FRAME + r * CELL, dark = (r + col) % 2 === 1, j = rand() * 14 - 7;
      if (dark) woodRect(g, x, y, CELL, CELL, [`rgb(${96 + j},${56 + j * 0.6},${32 + j * 0.4})`, `rgb(${70 + j},${38 + j * 0.5},${20 + j * 0.3})`], "15,5,0", "230,160,100", rand, 16, 2.2, rand() < 0.5);
      else woodRect(g, x, y, CELL, CELL, [`rgb(${244 + j * 0.5},${222 + j * 0.6},${172 + j})`, `rgb(${226 + j * 0.5},${196 + j * 0.6},${140 + j})`], "150,90,30", "255,255,235", rand, 12, 2.0, rand() < 0.5);
      g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(x, y, CELL, 1); g.fillRect(x, y, 1, CELL);
      g.fillStyle = "rgba(0,0,0,.14)"; g.fillRect(x, y + CELL - 1, CELL, 1); g.fillRect(x + CELL - 1, y, 1, CELL);
    }
    // inner shadow at the recess edge
    const sh = 9;
    const edge = (x, y, w, h, x2, y2) => { const lg = g.createLinearGradient(x, y, x2, y2); lg.addColorStop(0, "rgba(0,0,0,.45)"); lg.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = lg; g.fillRect(x, y, w, h); };
    edge(FRAME, FRAME, BW, sh, FRAME, FRAME + sh);
    edge(FRAME, FRAME, sh, BW, FRAME + sh, FRAME);
    const lg2 = g.createLinearGradient(0, FRAME + BW - 5, 0, FRAME + BW); lg2.addColorStop(0, "rgba(0,0,0,0)"); lg2.addColorStop(1, "rgba(0,0,0,.25)"); g.fillStyle = lg2; g.fillRect(FRAME, FRAME + BW - 5, BW, 5);
    // brass studs
    for (const [x, y] of [[11, 11], [T - 11, 11], [11, T - 11], [T - 11, T - 11]]) {
      const rg = g.createRadialGradient(x - 1.5, y - 1.5, 0.5, x, y, 5); rg.addColorStop(0, "#fff2b0"); rg.addColorStop(1, "#a8761a");
      g.fillStyle = rg; g.beginPath(); g.arc(x, y, 4.5, 0, 6.28); g.fill();
    }
    boardImg = cv;
  }

  // ---------- disc drawing ----------
  const PAL = {
    [RED]: { hi: "#ff8a78", mid: "#d8281f", lo: "#8b0e0e", edge: "#5c0808", edgeHi: "#b31c1c", ring: "rgba(255,210,190,.35)" },
    [BLACK]: { hi: "#7c8092", mid: "#2b2c35", lo: "#0d0d11", edge: "#040406", edgeHi: "#2a2b33", ring: "rgba(170,190,255,.22)" },
  };
  function crownPath(x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x - s, y + s * 0.55); ctx.lineTo(x - s * 1.05, y - s * 0.55); ctx.lineTo(x - s * 0.5, y - s * 0.05); ctx.lineTo(x, y - s * 0.75);
    ctx.lineTo(x + s * 0.5, y - s * 0.05); ctx.lineTo(x + s * 1.05, y - s * 0.55); ctx.lineTo(x + s, y + s * 0.55); ctx.closePath();
  }
  function drawDisc(x, y, side, king, o) {
    o = o || {};
    const lift = o.lift || 0, sc = (o.scale || 1), r = R * sc, th = (king ? 7 : 4.5) * sc, p = PAL[side];
    const fy = y - lift - th * 0.5; // top face center
    ctx.save();
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    // shadow
    ctx.fillStyle = `rgba(0,0,0,${0.32 - lift * 0.005})`;
    ctx.beginPath(); ctx.ellipse(x + 2 + lift * 0.4, y + th * 0.6 + 3 + lift * 0.9, r * 1.02, r * 0.86, 0, 0, 6.28); ctx.fill();
    // edge (cylinder side)
    const eg = ctx.createLinearGradient(x - r, 0, x + r, 0); eg.addColorStop(0, p.edgeHi); eg.addColorStop(0.5, p.edge); eg.addColorStop(1, p.edgeHi);
    ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(x, fy + th, r, 0, Math.PI); ctx.lineTo(x - r, fy); ctx.lineTo(x + r, fy); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(x, fy + th, r, 0, 6.28); ctx.fill();
    // top face
    const fg = ctx.createRadialGradient(x - r * 0.35, fy - r * 0.4, r * 0.1, x, fy, r * 1.05);
    fg.addColorStop(0, p.hi); fg.addColorStop(0.55, p.mid); fg.addColorStop(1, p.lo);
    ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(x, fy, r, 0, 6.28); ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.stroke();
    // grooves
    ctx.strokeStyle = p.ring; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(x, fy, r * 0.8, 0, 6.28); ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.arc(x, fy, r * 0.62, 0, 6.28); ctx.stroke();
    ctx.strokeStyle = p.ring; ctx.beginPath(); ctx.arc(x, fy, r * 0.6, 0.4, 5.5); ctx.stroke();
    if (king) {
      const cs = r * 0.42 * (o.crown == null ? 1 : Math.max(0.01, o.crown));
      const cy = fy - (o.crown != null && o.crown < 1 ? (1 - o.crown) * 22 : 0);
      ctx.globalAlpha = (o.alpha == null ? 1 : o.alpha) * (o.crown == null ? 1 : Math.min(1, o.crown * 1.6));
      crownPath(x, cy, cs);
      const gg = ctx.createLinearGradient(0, cy - cs, 0, cy + cs); gg.addColorStop(0, "#fff3a8"); gg.addColorStop(0.5, "#f2b632"); gg.addColorStop(1, "#b97a0d");
      ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1.5;
      ctx.fillStyle = gg; ctx.fill(); ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.lineWidth = 1.1; ctx.strokeStyle = "#7a4d00"; ctx.stroke();
      ctx.fillStyle = "#fff8d0";
      for (const [dx, dy] of [[-1.05, -0.55], [0, -0.75], [1.05, -0.55]]) { ctx.beginPath(); ctx.arc(x + dx * cs, cy + dy * cs, cs * 0.16, 0, 6.28); ctx.fill(); }
      ctx.fillStyle = "rgba(122,77,0,.55)"; ctx.fillRect(x - cs, cy + cs * 0.22, cs * 2, cs * 0.12);
      ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    }
    // specular highlight
    ctx.save(); ctx.beginPath(); ctx.arc(x, fy, r, 0, 6.28); ctx.clip();
    const sg = ctx.createLinearGradient(x - r * 0.6, fy - r, x + r * 0.2, fy + r * 0.1);
    sg.addColorStop(0, "rgba(255,255,255,.55)"); sg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(x - r * 0.28, fy - r * 0.5, r * 0.58, r * 0.3, -0.5, 0, 6.28); ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  // ---------- sprites & effects ----------
  function newSprite(p, sq) { return { side: p > 0 ? BLACK : RED, king: Math.abs(p) === 2, x: sq & 7, y: sq >> 3, z: 0, scale: 1, crown: null, alpha: 1 }; }
  function syncSprites() { sprites = new Array(64).fill(null); for (let i = 0; i < 64; i++) if (st.b[i]) sprites[i] = newSprite(st.b[i], i); }
  function burst(px, py, colors, n, spd) {
    for (let i = 0; i < n; i++) { const a = rnd(0, 6.28), s = rnd(40, spd || 200); particles.push({ x: px, y: py, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: rnd(0.5, 1), max: 1, color: colors[(Math.random() * colors.length) | 0], size: rnd(2.5, 6), g: 500 }); }
  }
  function killSprite(sq) {
    const sp = sprites[sq]; if (!sp) return;
    sprites[sq] = null;
    const p = sqPx(sp.x, sp.y), pal = PAL[sp.side];
    burst(p.x, p.y, [pal.hi, pal.mid, pal.lo, "#fff"], 22, 240);
    rings.push({ x: p.x, y: p.y, life: 0.45, max: 0.45, color: sp.side === RED ? "255,120,100" : "190,200,255" });
    sfx.capture();
  }
  async function animStep(sp, from, to, capSq) {
    busy++;
    const jump = capSq >= 0, fx = sp.x, fy = sp.y, tx = to & 7, ty = to >> 3;
    sprites[from] = null; sprites[to] = sp; let killed = false;
    if (jump) sfx.hop(); else sfx.move();
    await tween(jump ? 320 : 230, (k) => {
      sp.x = fx + (tx - fx) * k; sp.y = fy + (ty - fy) * k;
      sp.z = Math.sin(k * Math.PI) * (jump ? 16 : 5); sp.scale = 1 + Math.sin(k * Math.PI) * (jump ? 0.08 : 0.02);
      if (jump && !killed && k > 0.5) { killed = true; killSprite(capSq); }
    });
    sp.x = tx; sp.y = ty; sp.z = 0; sp.scale = 1; busy--;
  }
  async function promoteAnim(sq) {
    const sp = sprites[sq]; if (!sp) return;
    busy++; sp.king = true; sp.crown = 0; sfx.king();
    const p = sqPx(sp.x, sp.y);
    burst(p.x, p.y - 10, ["#fff3a8", "#f2b632", "#ffffff"], 26, 220);
    rings.push({ x: p.x, y: p.y, life: 0.6, max: 0.6, color: "255,225,120" });
    await tween(520, (k) => { sp.crown = easeOutBack(k); sp.scale = 1 + Math.sin(k * Math.PI) * 0.16; });
    sp.crown = null; sp.scale = 1; busy--;
  }
  function popup(text, x, y, color) { popups.push({ text, x, y, life: 1.1, color: color || "#fff" }); }
  function flash(text) { flashText = text; flashT = 1.6; shakeT = 0.35; sfx.bad(); }

  // ---------- game flow ----------
  function startGame() {
    if (cancelThink) { cancelThink(); cancelThink = null; }
    thinking = false; busy = 0; tweens.length = 0;
    flip = cfg.mode === "ai" && cfg.human === BLACK;
    st = E.newState(); legal = E.genMoves(st); hashes = [E.keyOf(st)]; undoStack = []; lastMove = null; humanMoves = 0;
    over = null; submitted = false; sel = null; partial = null; drag = null; particles = []; confetti = []; popups = []; rings = [];
    syncSprites(); scr = "play"; gameStarted = true; restartArmed = 0; kc = null;
    turnStart();
  }
  function isAiTurn() { return cfg.mode === "ai" && st.turn !== cfg.human; }
  function turnStart() {
    legal = E.genMoves(st);
    if (isAiTurn()) think();
  }
  function think() {
    thinking = true;
    const lvl = E.LEVELS[cfg.level];
    cancelThink = E.chooseMoveAsync(st, lvl, hashes, async (r) => {
      thinking = false; cancelThink = null;
      if (!r || !r.move) return;
      await playMove(r.move, 0);
    }, { isPaused: () => paused });
  }
  async function playMove(m, fromStep) {
    // animate the remaining jumps/steps of a whole move, then commit
    const sp = sprites[m.path[fromStep]];
    busy++;
    for (let k = fromStep; k < m.path.length - 1; k++) await animStep(sprites[m.path[k]], m.path[k], m.path[k + 1], m.caps.length ? m.caps[k] : -1);
    busy--;
    await commit(m);
    void sp;
  }
  async function commit(m) {
    busy++;
    undoStack.push({ st, lastMove, hlen: hashes.length, hm: humanMoves });
    const mover = st.turn;
    st = E.applyMove(st, m); hashes.push(E.keyOf(st)); lastMove = m;
    if (cfg.mode === "ai" && mover === cfg.human) humanMoves++;
    partial = null; sel = null;
    if (m.promo) await promoteAnim(m.to);
    busy--;
    legal = E.genMoves(st);
    const res = E.gameResult(st, hashes, legal);
    if (res.over) endGame(res); else turnStart();
  }
  function canUndo() {
    if (over || !undoStack.length || busy) return false;
    return cfg.mode === "pvp" || undoStack.some((u) => u.st.turn === cfg.human);
  }
  function undo() {
    if (scr !== "play" || !canUndo()) { if (scr === "play") sfx.bad(); return; }
    if (cancelThink) { cancelThink(); cancelThink = null; } thinking = false;
    let u = undoStack.pop();
    if (cfg.mode === "ai") while (u.st.turn !== cfg.human && undoStack.length) u = undoStack.pop();
    st = u.st; lastMove = u.lastMove; hashes.length = u.hlen; humanMoves = u.hm;
    sel = null; partial = null; drag = null; tweens.length = 0; busy = 0;
    syncSprites(); legal = E.genMoves(st); sfx.tick();
    if (isAiTurn()) think();
  }
  function scoreFor(res) {
    const lvl = cfg.level, base = [300, 700, 1500, 3000][lvl];
    if (res.winner === 0) return Math.round(base * 0.2);
    if (res.winner !== cfg.human) return 0;
    const n = E.counts(st), mine = cfg.human === BLACK ? n.black : n.red;
    return base + Math.max(0, 50 - humanMoves) * [4, 8, 15, 30][lvl] + mine * [10, 20, 40, 80][lvl];
  }
  function endGame(res) {
    over = res; overAt = t + 1.1; sel = null; partial = null;
    const humanWon = cfg.mode === "ai" && res.winner === cfg.human, aiWon = cfg.mode === "ai" && res.winner === -cfg.human;
    if (res.winner === 0) { sfx.tick(); }
    else if (cfg.mode === "pvp" || humanWon) { sfx.win(); celebrate(res.winner); }
    else sfx.lose();
    if (cfg.mode === "ai") {
      const score = scoreFor(res); over.score = score;
      if (humanWon) { stats.wins[cfg.level]++; }
      if (score > stats.best[cfg.level]) stats.best[cfg.level] = score;
      saveStats();
      if (!submitted) { submitted = true; try { if (window.Arcadia) { Arcadia.submitScore(score); Arcadia.gameOver(); } } catch (e) {} }
    }
    void aiWon;
  }
  function celebrate(winner) { celeb = { until: t + 4.5, winner }; }
  let celeb = null;

  // ---------- input ----------
  const dests = () => {
    const k = partial ? partial.k : 0, cands = partial ? partial.cands : sel != null ? legal.filter((m) => m.from === sel) : [];
    const map = new Map();
    for (const m of cands) if (m.path.length > k + 1) { const d = m.path[k + 1]; if (!map.has(d)) map.set(d, []); map.get(d).push(m); }
    return map;
  };
  const forced = () => legal.length > 0 && legal[0].caps.length > 0;
  const movableSet = () => new Set(partial ? [partial.sq] : legal.map((m) => m.from));
  function canAct() { return scr === "play" && !over && !busy && !thinking && st && (cfg.mode === "pvp" || st.turn === cfg.human); }

  async function step(dest) {
    const k = partial ? partial.k : 0, from = partial ? partial.sq : sel;
    const cands = (partial ? partial.cands : legal.filter((m) => m.from === from)).filter((m) => m.path.length > k + 1 && m.path[k + 1] === dest);
    if (!cands.length) return;
    const m0 = cands[0], sp = sprites[from], capSq = m0.caps.length ? m0.caps[k] : -1;
    const trail = partial ? partial.trail.slice() : [from];
    trail.push(dest); sel = null; drag = null;
    busy++;
    await animStep(sp, from, dest, capSq);
    busy--;
    if (m0.path.length === k + 2) { await commit(m0); }
    else { partial = { sq: dest, k: k + 1, cands, trail }; sel = dest; sfx.tick(); }
  }
  async function returnHome(sq) {
    const sp = sprites[sq]; if (!sp) return;
    const fx = sp.x, fy = sp.y; busy++; sp.drag = false;
    await tween(140, (k) => { sp.x = fx + ((sq & 7) - fx) * k; sp.y = fy + ((sq >> 3) - fy) * k; });
    busy--;
  }
  function tapCell(sq, wasSel) {
    if (!canAct() || sq < 0) return;
    const d = dests();
    if (sel != null && d.has(sq)) { step(sq); return; }
    const p = st.b[sq];
    if (p * st.turn > 0) {
      if (partial) { flash("Keep jumping with the same piece!"); return; }
      if (movableSet().has(sq)) { sel = wasSel ? null : sq; if (sel != null) sfx.tick(); }
      else { sel = null; pulseT = 1.2; flash(forced() ? "Capture is mandatory! Use a glowing piece." : "That piece is blocked."); }
    } else if (partial) flash("Keep jumping with the same piece!");
    else sel = null;
  }

  let ptr = { x: -1, y: -1 }, pressed = null, hits = [];
  function pt(e) { const r = c.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; }
  const inRect = (p, h) => p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h;
  c.addEventListener("pointerdown", (e) => {
    ptr = pt(e); c.focus();
    try { if (actx && actx.state === "suspended") actx.resume(); else if (!actx && cfg.sound) actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (er) {}
    for (let i = hits.length - 1; i >= 0; i--) if (inRect(ptr, hits[i]) && !hits[i].disabled) { pressed = hits[i]; return; }
    pressed = null;
    if (scr === "play" && canAct()) {
      const sq = pxSq(ptr.x, ptr.y);
      if (sq >= 0 && st.b[sq] * st.turn > 0 && movableSet().has(sq) && (!partial || partial.sq === sq)) {
        const wasSel = sel === sq; if (!partial) sel = sq;
        drag = { sq, x0: ptr.x, y0: ptr.y, active: false, wasSel };
        try { c.setPointerCapture(e.pointerId); } catch (er) {}
      } else drag = { sq, x0: ptr.x, y0: ptr.y, active: false, tap: true };
    }
  });
  c.addEventListener("pointermove", (e) => {
    ptr = pt(e);
    if (drag && !drag.tap) {
      if (!drag.active && Math.hypot(ptr.x - drag.x0, ptr.y - drag.y0) > 9) { drag.active = true; if (!partial) sel = drag.sq; const sp = sprites[drag.sq]; if (sp) sp.drag = true; }
    }
  });
  c.addEventListener("pointerup", (e) => {
    ptr = pt(e);
    if (pressed) { const h = pressed; pressed = null; if (inRect(ptr, h) && !h.disabled) h.fn(); drag = null; return; }
    if (!drag) return;
    const d = drag; drag = null;
    if (d.tap) { tapCell(pxSq(ptr.x, ptr.y), false); return; }
    const sp = sprites[d.sq];
    if (d.active && sp) {
      const target = pxSq(ptr.x, ptr.y);
      // put the sprite where the finger is, then glide to the destination or home
      const vx = (ptr.x - OX) / CELL - 0.5, vy = (ptr.y - OY) / CELL - 0.5;
      sp.x = flip ? 7 - vx : vx; sp.y = flip ? 7 - vy : vy; sp.drag = false;
      if (sel != null && dests().has(target)) { sel = partial ? partial.sq : d.sq; step(target); }
      else { returnHome(d.sq); }
    } else tapCell(d.sq, d.wasSel);
  });
  c.addEventListener("pointercancel", () => { if (drag && drag.active) returnHome(drag.sq); drag = null; pressed = null; });
  addEventListener("keydown", (e) => {
    const k = e.key;
    if (scr === "menu") { if (k === "Enter" || k === " ") { e.preventDefault(); startGame(); } return; }
    if (k === "u" || k === "U") undo();
    else if (k === "n" || k === "N") startGame();
    else if (k === "Escape") toMenu();
    else if (k === "m" || k === "M") { cfg.sound = !cfg.sound; saveCfg(); }
    else if (k.startsWith("Arrow")) {
      e.preventDefault(); if (!kc) kc = { r: 5, c: 0 };
      const dv = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k];
      kc.r = Math.max(0, Math.min(7, kc.r + dv[0])); kc.c = Math.max(0, Math.min(7, kc.c + dv[1]));
    } else if ((k === "Enter" || k === " ") && kc) { e.preventDefault(); const sq = flip ? (7 - kc.r) * 8 + (7 - kc.c) : kc.r * 8 + kc.c; tapCell(sq, false); }
  });
  if (window.Arcadia) { try { Arcadia.onPause(() => (paused = true)); Arcadia.onResume(() => (paused = false)); } catch (e) {} }
  document.addEventListener("visibilitychange", () => {});
  function toMenu() { if (cancelThink && !gameStarted) { cancelThink(); } scr = "menu"; sel = null; drag = null; }

  // ---------- UI drawing helpers ----------
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  function text(str, x, y, size, color, weight, align, spacing) {
    ctx.font = `${weight || 700} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.fillStyle = color || "#fff"; ctx.textAlign = align || "center"; ctx.textBaseline = "middle";
    try { ctx.letterSpacing = (spacing || 0) + "px"; } catch (e) {}
    ctx.fillText(str, x, y);
    try { ctx.letterSpacing = "0px"; } catch (e) {}
  }
  function button(x, y, w, h, label, fn, o) {
    o = o || {};
    const hit = { x, y, w, h, fn, disabled: !!o.disabled }; hits.push(hit);
    const hover = inRect(ptr, hit) && !o.disabled, down = pressed && pressed.x === x && pressed.y === y && hover;
    const active = !!o.active, dy = down ? 2 : 0;
    ctx.save();
    ctx.globalAlpha = o.disabled ? 0.4 : 1;
    ctx.fillStyle = "rgba(0,0,0,.4)"; rr(x, y + 4, w, h, h * 0.28); ctx.fill();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    if (o.primary) { g.addColorStop(0, "#ffe089"); g.addColorStop(1, "#d9962b"); }
    else if (active) { g.addColorStop(0, "#8a5a32"); g.addColorStop(1, "#5c3a1e"); }
    else { g.addColorStop(0, hover ? "#5d3d24" : "#4b2f1b"); g.addColorStop(1, hover ? "#3f2714" : "#33200f"); }
    ctx.fillStyle = g; rr(x, y + dy, w, h, h * 0.28); ctx.fill();
    ctx.lineWidth = active ? 2.5 : 1.5; ctx.strokeStyle = active ? GOLD : o.primary ? "#fff1bd" : "rgba(255,225,170,.28)"; ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.12)"; rr(x + 3, y + dy + 2, w - 6, h * 0.42, h * 0.22); ctx.fill();
    if (o.icon) o.icon(x + h * 0.55, y + h / 2 + dy);
    text(label, x + w / 2 + (o.icon ? h * 0.22 : 0), y + h / 2 + dy + 1, o.size || 20, o.primary ? "#3b2107" : active ? "#fff4d6" : CREAM, 800);
    ctx.restore();
  }
  function miniDisc(x, y, side, r) {
    const p = PAL[side], g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.05);
    g.addColorStop(0, p.hi); g.addColorStop(0.55, p.mid); g.addColorStop(1, p.lo);
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.arc(x + 1, y + 2, r, 0, 6.28); ctx.fill();
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.lineWidth = 1; ctx.stroke();
  }

  function drawBackdrop() {
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#2c190d"); bg.addColorStop(0.5, "#22130a"); bg.addColorStop(1, "#1a0e06");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // faint felt-like radial light
    const rg = ctx.createRadialGradient(W / 2, 430, 40, W / 2, 430, 560); rg.addColorStop(0, "rgba(255,190,110,.16)"); rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  }

  // ---------- menu ----------
  function drawMenu() {
    drawBackdrop();
    // decorative discs
    const xs = [70, 150, 230, 310, 390, 470];
    xs.forEach((x, i) => drawDisc(x, 262 + Math.sin(t * 2 + i) * 3, i % 2 ? RED : BLACK, i === 2 || i === 3, { lift: 3 + Math.sin(t * 2 + i) * 3 }));
    text("CHECKERS", W / 2, 96, 70, GOLD, 900, "center", 4);
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 8; text("CLASSIC", W / 2, 158, 30, CREAM, 800, "center", 14); ctx.restore();
    text("MODE", 30, 342, 14, "#c9a878", 800, "left", 3);
    button(30, 356, 235, 54, "vs Computer", () => { cfg.mode = "ai"; saveCfg(); }, { active: cfg.mode === "ai" });
    button(275, 356, 235, 54, "2 Players", () => { cfg.mode = "pvp"; saveCfg(); }, { active: cfg.mode === "pvp" });
    if (cfg.mode === "ai") {
      text("YOU PLAY", 30, 446, 14, "#c9a878", 800, "left", 3);
      button(30, 460, 235, 54, "Black", () => { cfg.human = BLACK; saveCfg(); }, { active: cfg.human === BLACK, icon: (x, y) => miniDisc(x, y, BLACK, 13) });
      button(275, 460, 235, 54, "Red", () => { cfg.human = RED; saveCfg(); }, { active: cfg.human === RED, icon: (x, y) => miniDisc(x, y, RED, 13) });
      text("Black always moves first", W / 2, 534, 14, "#a58a68", 600);
      text("DIFFICULTY", 30, 570, 14, "#c9a878", 800, "left", 3);
      E.LEVELS.forEach((l, i) => button(30 + i * 122, 584, 116, 50, l.name, () => { cfg.level = i; saveCfg(); }, { active: cfg.level === i, size: 17 }));
      text(`Wins ${stats.wins[cfg.level]}   ·   Best score ${stats.best[cfg.level]}`, W / 2, 668, 15, "#c9a878", 700);
    } else {
      text("Pass the device back and forth.", W / 2, 490, 18, CREAM, 700);
      text("Black moves first, Red answers.", W / 2, 522, 15, "#a58a68", 600);
    }
    button(80, 704, 380, 76, gameStarted && scr === "menu" && over === null && st && undoStack.length ? "Restart Game" : "Play", startGame, { primary: true, size: 32 });
    if (gameStarted && over === null && st && undoStack.length) button(150, 796, 240, 44, "Resume game", () => (scr = "play"), { size: 17 });
    else text("Capture is mandatory  ·  Kings move both ways", W / 2, 818, 14, "#8f7656", 600);
  }

  // ---------- play screen ----------
  function drawChip(x, y, w, h, side, active) {
    const n = E.counts(st), mine = side === BLACK ? n.black : n.red, theirs = side === BLACK ? n.red : n.black, kings = side === BLACK ? n.blackKings : n.redKings;
    ctx.save();
    if (active && !over) { ctx.shadowColor = GOLD; ctx.shadowBlur = 16 + Math.sin(t * 5) * 5; }
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, active ? "#6a4527" : "#43291a"); g.addColorStop(1, active ? "#4a2e17" : "#2e1c10");
    ctx.fillStyle = g; rr(x, y, w, h, 16); ctx.fill(); ctx.shadowBlur = 0;
    ctx.lineWidth = active && !over ? 2.5 : 1.2; ctx.strokeStyle = active && !over ? GOLD : "rgba(255,225,170,.22)"; ctx.stroke();
    ctx.restore();
    drawDisc(x + 34, y + 30, side, false, { scale: 0.72 });
    let label = sideName(side);
    if (cfg.mode === "ai") label = side === cfg.human ? "You" : "Computer";
    text(label, x + 66, y + 20, 19, CREAM, 800, "left");
    text(`${mine} left${kings ? `  ·  ${kings} king${kings > 1 ? "s" : ""}` : ""}`, x + 66, y + 41, 13, "#c9a878", 600, "left");
    // captured pieces
    const cap = 12 - theirs;
    for (let i = 0; i < Math.min(12, cap); i++) miniDisc(x + w - 14 - (Math.min(12, cap) - 1 - i) * 6.5, y + 17, -side, 5.5);
  }
  function statusInfo() {
    if (over) {
      if (over.winner === 0) return ["Draw by " + over.reason, GOLD];
      if (cfg.mode === "ai") return [over.winner === cfg.human ? "You win!" : "Computer wins", over.winner === cfg.human ? "#8ff0a4" : "#ff9c8f"];
      return [sideName(over.winner) + " wins!", GOLD];
    }
    if (isAiTurn()) return [thinking ? "Computer is thinking" + ".".repeat(1 + ((t * 3) | 0) % 3) : "Computer moves", "#e8d2ac"];
    if (flashT > 0) return [flashText, "#ffb08a"];
    if (partial) return ["Keep jumping! Take the next piece", GOLD];
    const who = cfg.mode === "ai" ? "Your move" : sideName(st.turn) + "'s move";
    if (forced()) return ["Capture required! " + (cfg.mode === "ai" ? "" : sideName(st.turn) + " must jump"), GOLD].map((v, i) => (i ? v : v.trim()));
    return [who, "#f1e2c4"];
  }
  function drawPlay() {
    drawBackdrop();
    text("CHECKERS CLASSIC", W / 2, 26, 18, GOLD, 900, "center", 5);
    const bs = bottomSide(), ts = -bs;
    drawChip(14, 48, 250, 66, bs, st.turn === bs);
    drawChip(276, 48, 250, 66, ts, st.turn === ts);
    // status banner
    const [msg, col] = statusInfo();
    const sx = shakeT > 0 ? Math.sin(t * 60) * 5 * shakeT : 0;
    ctx.fillStyle = "rgba(0,0,0,.28)"; rr(60 + sx, 128, W - 120, 36, 18); ctx.fill();
    text(msg, W / 2 + sx, 147, 19, col, 800);

    ctx.save();
    const bx = OX - FRAME, by = OY - FRAME;
    ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 22; ctx.shadowOffsetY = 10;
    ctx.drawImage(boardImg, bx, by, N * CELL + FRAME * 2, N * CELL + FRAME * 2);
    ctx.restore();

    // last move highlight
    if (lastMove) {
      for (const s of lastMove.path) {
        const p = sqPx(s & 7, s >> 3);
        ctx.fillStyle = s === lastMove.from || s === lastMove.to ? "rgba(255,214,90,.38)" : "rgba(255,214,90,.2)";
        ctx.fillRect(p.x - CELL / 2, p.y - CELL / 2, CELL, CELL);
      }
      for (const s of lastMove.caps) { const p = sqPx(s & 7, s >> 3); ctx.strokeStyle = "rgba(255,110,90,.55)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x - 9, p.y - 9); ctx.lineTo(p.x + 9, p.y + 9); ctx.moveTo(p.x + 9, p.y - 9); ctx.lineTo(p.x - 9, p.y + 9); ctx.stroke(); }
    }
    const canA = canAct(), d = canA || partial ? dests() : new Map(), mov = canA ? movableSet() : new Set(), isForced = canA && forced();
    // selected square
    const selSq = partial ? partial.sq : sel;
    if (selSq != null && (canA || partial)) { const p = sqPx(selSq & 7, selSq >> 3); ctx.fillStyle = "rgba(120,255,160,.32)"; ctx.fillRect(p.x - CELL / 2, p.y - CELL / 2, CELL, CELL); ctx.strokeStyle = "rgba(190,255,205,.9)"; ctx.lineWidth = 2.5; ctx.strokeRect(p.x - CELL / 2 + 1.5, p.y - CELL / 2 + 1.5, CELL - 3, CELL - 3); }
    // chain trail
    if (partial) {
      ctx.save(); ctx.setLineDash([7, 6]); ctx.lineDashOffset = -t * 30; ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.beginPath();
      partial.trail.forEach((s, i) => { const p = sqPx(s & 7, s >> 3); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
      ctx.stroke(); ctx.restore();
    }
    // forced-capture glow under movable pieces
    if (isForced || (partial && canA)) for (const s of mov) {
      const sp = sprites[s]; if (!sp) continue; const p = sqPx(sp.x, sp.y), a = 0.55 + 0.35 * Math.sin(t * 6) + (pulseT > 0 ? 0.3 : 0);
      const g = ctx.createRadialGradient(p.x, p.y, R * 0.5, p.x, p.y, R * 1.55); g.addColorStop(0, `rgba(255,214,90,${0.7 * a})`); g.addColorStop(1, "rgba(255,214,90,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, R * 1.6, 0, 6.28); ctx.fill();
      ctx.strokeStyle = `rgba(255,226,120,${a})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, R * 1.25 + Math.sin(t * 6) * 1.5, 0, 6.28); ctx.stroke();
    }
    // destination dots
    for (const [ds, ms] of d) {
      const p = sqPx(ds & 7, ds >> 3), cap = ms[0].caps.length > 0, pulse = 1 + Math.sin(t * 6) * 0.08;
      if (cap) {
        ctx.fillStyle = "rgba(255,190,60,.28)"; ctx.fillRect(p.x - CELL / 2, p.y - CELL / 2, CELL, CELL);
        ctx.strokeStyle = "rgba(255,210,90,.95)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, 13 * pulse, 0, 6.28); ctx.stroke();
        ctx.fillStyle = "rgba(255,210,90,.9)"; ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, 6.28); ctx.fill();
      } else {
        ctx.fillStyle = "rgba(120,255,160,.22)"; ctx.fillRect(p.x - CELL / 2, p.y - CELL / 2, CELL, CELL);
        ctx.fillStyle = "rgba(190,255,205,.95)"; ctx.shadowColor = "rgba(0,0,0,.4)"; ctx.shadowBlur = 4;
        ctx.beginPath(); ctx.arc(p.x, p.y, 9 * pulse, 0, 6.28); ctx.fill(); ctx.shadowBlur = 0;
      }
    }
    // keyboard cursor
    if (kc) { ctx.strokeStyle = "#fff"; ctx.setLineDash([5, 4]); ctx.lineWidth = 2; ctx.strokeRect(OX + kc.c * CELL + 3, OY + kc.r * CELL + 3, CELL - 6, CELL - 6); ctx.setLineDash([]); }

    // pieces (top to bottom so lower pieces overlap correctly)
    const list = [];
    for (let i = 0; i < 64; i++) if (sprites[i]) list.push(sprites[i]);
    list.sort((a, b) => (flip ? -(a.y + a.z * 0.01) : a.y + a.z * 0.01) - (flip ? -(b.y + b.z * 0.01) : b.y + b.z * 0.01) || 0);
    let dragged = null;
    for (const sp of list) {
      if (sp.drag) { dragged = sp; continue; }
      const p = sqPx(sp.x, sp.y);
      const isSel = selSq != null && sprites[selSq] === sp;
      const winPop = over && celeb && over.winner === sp.side && t < celeb.until ? Math.abs(Math.sin(t * 5 + sp.x * 1.3 + sp.y)) * 9 : 0;
      drawDisc(p.x, p.y, sp.side, sp.king, { lift: sp.z + (isSel ? 5 : 0) + winPop, scale: sp.scale * (isSel ? 1.06 : 1), crown: sp.crown, alpha: over && over.winner !== 0 && over.winner !== sp.side ? 0.85 : 1 });
    }
    if (dragged) { dragged.x = flip ? 7 - ((ptr.x - OX) / CELL - 0.5) : (ptr.x - OX) / CELL - 0.5; dragged.y = flip ? 7 - ((ptr.y - OY) / CELL - 0.5) : (ptr.y - OY) / CELL - 0.5; drawDisc(ptr.x, ptr.y, dragged.side, dragged.king, { lift: 14, scale: 1.12 }); }
    // capture target rings for the selected piece's next jump
    for (const [, ms] of d) {
      const k = partial ? partial.k : 0, cs = ms[0].caps.length ? ms[0].caps[k] : -1;
      if (cs < 0 || !sprites[cs]) continue;
      const p = sqPx(cs & 7, cs >> 3), a = 0.5 + 0.4 * Math.sin(t * 7);
      ctx.strokeStyle = `rgba(255,90,70,${a})`; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.arc(p.x, p.y, R * 1.15, 0, 6.28); ctx.stroke(); ctx.setLineDash([]);
    }

    // effects
    for (const r of rings) { const k = 1 - r.life / r.max; ctx.strokeStyle = `rgba(${r.color},${(1 - k) * 0.9})`; ctx.lineWidth = 4 * (1 - k) + 1; ctx.beginPath(); ctx.arc(r.x, r.y, 10 + k * 46, 0, 6.28); ctx.stroke(); }
    for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * p.life / p.max), 0, 6.28); ctx.fill(); }
    ctx.globalAlpha = 1;
    for (const p of popups) { ctx.globalAlpha = Math.min(1, p.life * 2); text(p.text, p.x, p.y, 24, p.color, 900); }
    ctx.globalAlpha = 1;

    // bottom buttons
    const dis = !canUndo();
    button(20, 728, 156, 56, "Undo", undo, { disabled: dis, size: 19 });
    button(192, 728, 156, 56, restartArmed > 0 ? "Sure?" : "New Game", () => { if (restartArmed > 0 || over || !undoStack.length) startGame(); else restartArmed = 2.2; }, { size: 19, active: restartArmed > 0 });
    button(364, 728, 156, 56, "Menu", toMenu, { size: 19 });
    button(W - 58, 8, 44, 34, cfg.sound ? "♫" : "✕", () => { cfg.sound = !cfg.sound; saveCfg(); }, { size: 18 });
    text(cfg.mode === "ai" ? `${E.LEVELS[cfg.level].name} level  ·  Black moves first` : "2-player  ·  Black moves first", W / 2, 816, 14, "#8f7656", 600);

    // celebration + end panel
    for (const f of confetti) { ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.fillStyle = f.color; ctx.fillRect(-f.w / 2, -f.h / 2, f.w, f.h); ctx.restore(); }
    if (over && t > overAt) drawEndPanel();
  }
  function drawEndPanel() {
    hits = [];
    const k = Math.min(1, (t - overAt) * 3), e = easeOutBack(k);
    ctx.fillStyle = `rgba(10,5,2,${0.55 * k})`; ctx.fillRect(0, 0, W, H);
    const pw = 400, ph = over.score != null ? 330 : 290, px = (W - pw) / 2, py = 250 + (1 - e) * 40;
    ctx.save(); ctx.globalAlpha = k;
    ctx.shadowColor = "rgba(0,0,0,.7)"; ctx.shadowBlur = 30;
    const g = ctx.createLinearGradient(0, py, 0, py + ph); g.addColorStop(0, "#5b3a20"); g.addColorStop(1, "#331f10");
    ctx.fillStyle = g; rr(px, py, pw, ph, 26); ctx.fill(); ctx.shadowBlur = 0;
    ctx.lineWidth = 2.5; ctx.strokeStyle = GOLD; ctx.stroke();
    const humanWon = cfg.mode === "ai" && over.winner === cfg.human;
    let title, sub, col = GOLD;
    if (over.winner === 0) { title = "Draw"; sub = over.reason === "repetition" ? "Same position three times" : "40 moves without a capture or a man move"; }
    else if (cfg.mode === "ai") { title = humanWon ? "You win!" : "Computer wins"; col = humanWon ? "#8ff0a4" : "#ff9c8f"; sub = humanWon ? "Beautifully played." : "Try an easier level or undo earlier." ; if (over.reason === "blocked") sub = humanWon ? "The computer has no moves left." : "You have no legal moves left."; }
    else { title = sideName(over.winner) + " wins!"; sub = "The other side has no moves left."; }
    if (over.winner !== 0) drawDisc(W / 2, py + 62 + Math.sin(t * 4) * 3, over.winner, true, { scale: 1.1, lift: 4 });
    else { drawDisc(W / 2 - 24, py + 62, BLACK, false, { scale: 0.9 }); drawDisc(W / 2 + 24, py + 62, RED, false, { scale: 0.9 }); }
    text(title, W / 2, py + 122, 44, col, 900);
    text(sub, W / 2, py + 158, 15, "#d9c1a0", 600);
    let by = py + 184;
    if (over.score != null) { text(`Score  ${over.score}`, W / 2, py + 192, 26, CREAM, 900); by = py + 222; }
    button(px + 24, by, (pw - 60) / 2, 58, "Play Again", startGame, { primary: true, size: 20 });
    button(px + 36 + (pw - 60) / 2, by, (pw - 60) / 2, 58, "Menu", toMenu, { size: 20 });
    ctx.restore();
  }

  // ---------- loop ----------
  function update(dt) {
    t += dt;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i]; tw.t += dt * 1000; const k = Math.min(1, tw.t / tw.dur);
      tw.fn(tw.ease(k));
      if (k >= 1) { tweens.splice(i, 1); tw.res(); }
    }
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.life -= dt; }
    particles = particles.filter((p) => p.life > 0);
    for (const r of rings) r.life -= dt; rings = rings.filter((r) => r.life > 0);
    for (const p of popups) { p.life -= dt; p.y -= 30 * dt; } popups = popups.filter((p) => p.life > 0);
    for (const f of confetti) { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 120 * dt; f.rot += f.vr * dt; }
    confetti = confetti.filter((f) => f.y < H + 30);
    if (celeb && t < celeb.until && confetti.length < 160) for (let i = 0; i < 4; i++) confetti.push({ x: rnd(0, W), y: -20, vx: rnd(-40, 40), vy: rnd(60, 200), rot: rnd(0, 6), vr: rnd(-8, 8), w: rnd(6, 11), h: rnd(4, 8), color: ["#f4c95d", "#ff5a4d", "#8ff0a4", "#7cc4ff", "#ffffff", "#c58bff"][(Math.random() * 6) | 0] });
    if (flashT > 0) flashT -= dt; if (shakeT > 0) shakeT -= dt; if (pulseT > 0) pulseT -= dt; if (restartArmed > 0) restartArmed -= dt;
  }
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!paused) update(dt);
    hits = [];
    ctx.save();
    try { if (scr === "menu") drawMenu(); else drawPlay(); } catch (e) { console.error(e); }
    ctx.restore();
    requestAnimationFrame(loop);
  }
  makeBoard();
  st = E.newState(); syncSprites();
  requestAnimationFrame(loop);

  // test/debug hook (harmless in production)
  window.__checkers = { load(rows, turn) { startGame(); if (cancelThink) { cancelThink(); cancelThink = null; } thinking = false; st = E.fromRows(rows, turn); hashes = [E.keyOf(st)]; syncSprites(); legal = E.genMoves(st); if (isAiTurn()) think(); }, celebrateNow() { const r = { over: true, winner: cfg.human, reason: 'blocked' }; endGame(r); }, get state() { return st; }, get legal() { return legal; }, get over() { return over; }, get busy() { return busy || thinking; }, cfg, startGame, sqPx, get flip() { return flip; }, get scr() { return scr; }, get partial() { return partial; } };
})();
