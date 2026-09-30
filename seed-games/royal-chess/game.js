// Royal Chess — an Arcadia seed game. Full-rules chess vs the computer (4 levels) or pass-and-play. Fork it and make it better!
(() => {
  const E = window.ChessEngine;
  const { Position, WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, F_CASTLE, F_EP, LEVELS } = E;
  const W = 480, H = 960, CELL = 58, BX = 8, BY = 178, BS = CELL * 8;
  const c = document.getElementById("c");
  const ctx = c.getContext("2d");
  function fit() {
    const s = Math.min(innerWidth / W, innerHeight / H), d = window.devicePixelRatio || 1;
    c.style.width = W * s + "px"; c.style.height = H * s + "px";
    c.width = Math.round(W * s * d); c.height = Math.round(H * s * d);
    ctx.setTransform(s * d, 0, 0, s * d, 0, 0);
  }
  addEventListener("resize", fit); fit();

  // ---------- storage (Arcadia shim: localStorage only, always guarded) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  const settings = Object.assign({ mode: "cpu", level: 2, side: "white" }, store.get("royalchess.settings", {}));
  const bestScores = store.get("royalchess.best", {}) || {};

  // ---------- piece art (all drawn from vector paths, no fonts) ----------
  const P2D = (d) => new Path2D(d);
  const BASE = "M20 80 H80 Q85 80 85 85 V88 Q85 92 80 92 H20 Q15 92 15 88 V85 Q15 80 20 80Z";
  const ART = {
    [PAWN]: { parts: ["M40 46 C40 58 32 68 30 80 H70 C68 68 60 58 60 46Z", BASE, "M34 42 Q34 38 38 38 H62 Q66 38 66 42 Q66 46 62 46 H38 Q34 46 34 42Z", "M38 27a12 12 0 1 0 24 0a12 12 0 1 0-24 0z"], detail: [] },
    [ROOK]: { parts: ["M36 40 H64 L66 64 H72 Q73 64 73 66 V80 H27 V66 Q27 64 28 64 H34Z", BASE, "M28 16 H39 V24 H45 V16 H55 V24 H61 V16 H72 V34 Q72 38 68 40 H32 Q28 38 28 34Z"], detail: ["M30 34 H70", "M31 70 H69"] },
    [BISHOP]: { parts: ["M40 60 C40 68 34 74 31 80 H69 C66 74 60 68 60 60Z", BASE, "M34 56 Q34 52 38 52 H62 Q66 52 66 56 Q66 60 62 60 H38 Q34 60 34 56Z", "M50 15 C60 24 68 34 65 44 C63 50 58 52 50 52 C42 52 37 50 35 44 C32 34 40 24 50 15Z", "M44.5 12a5.5 5.5 0 1 0 11 0a5.5 5.5 0 1 0-11 0z"], detail: ["M50 27 L58 37", "M43 40 H57"] },
    [KNIGHT]: { parts: ["M28 80 C28 68 32 60 40 52 C36 52 30 54 26 58 C20 56 18 50 24 42 C30 34 36 26 42 18 L44 8 L52 14 C58 13 64 15 68 20 C78 32 82 52 78 66 C77 72 77 76 77 80Z", BASE], detail: ["M56 22 C64 30 68 44 66 62", "M27 48 L31 47"], dot: [[46, 28, 2.8]] },
    [QUEEN]: { parts: ["M30 72 H70 L72 80 H28Z", BASE, "M28 72 L21 30 L37 50 L38 22 L46 48 L50 16 L54 48 L62 22 L63 50 L79 30 L72 72Z", "M17.5 28a4.2 4.2 0 1 0 8.4 0a4.2 4.2 0 1 0-8.4 0z", "M33.8 21a4.2 4.2 0 1 0 8.4 0a4.2 4.2 0 1 0-8.4 0z", "M45.8 15a4.2 4.2 0 1 0 8.4 0a4.2 4.2 0 1 0-8.4 0z", "M57.8 21a4.2 4.2 0 1 0 8.4 0a4.2 4.2 0 1 0-8.4 0z", "M74.1 28a4.2 4.2 0 1 0 8.4 0a4.2 4.2 0 1 0-8.4 0z"], detail: ["M33 66 H67"] },
    [KING]: { parts: ["M30 72 H70 L72 80 H28Z", BASE, "M50 30 C44 24 26 26 26 43 C26 53 34 57 37 62 L34 72 H66 L63 62 C66 57 74 53 74 43 C74 26 56 24 50 30Z", "M46 4 H54 V11 H61 V18 H54 V26 H46 V18 H39 V11 H46Z"], detail: ["M36 62 H64", "M50 32 V44"] },
  };
  const artCache = {};
  for (const t in ART) artCache[t] = { parts: ART[t].parts.map(P2D), detail: ART[t].detail.map(P2D), dot: ART[t].dot || [] };
  const gradCache = {};
  function pieceGrad(color) {
    if (!gradCache[color]) {
      const g = ctx.createLinearGradient(24, 8, 76, 92);
      if (color === WHITE) { g.addColorStop(0, "#ffffff"); g.addColorStop(0.5, "#f1e7cf"); g.addColorStop(1, "#c9b78e"); }
      else { g.addColorStop(0, "#6a6d86"); g.addColorStop(0.45, "#33344a"); g.addColorStop(1, "#14141f"); }
      gradCache[color] = g;
    }
    return gradCache[color];
  }
  // draws piece type t of colour col centred at (cx,cy) with box size s
  function drawPiece(t, col, cx, cy, s, alpha, shadow) {
    const art = artCache[t];
    ctx.save();
    ctx.translate(cx - s / 2, cy - s / 2 - s * 0.02); ctx.scale(s / 100, s / 100);
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    if (shadow !== false) { ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(50, 91, 34, 5.5, 0, 0, Math.PI * 2); ctx.fill(); }
    const outline = col === WHITE ? "#2a1f14" : "#050509";
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.fillStyle = pieceGrad(col); ctx.strokeStyle = outline; ctx.lineWidth = 3;
    for (const p of art.parts) { ctx.fill(p); ctx.stroke(p); }
    ctx.lineWidth = 1.8; ctx.strokeStyle = col === WHITE ? "rgba(42,31,20,.7)" : "rgba(190,195,230,.42)";
    for (const p of art.detail) ctx.stroke(p);
    ctx.fillStyle = col === WHITE ? "#2a1f14" : "#dfe3ff";
    for (const [x, y, r] of art.dot) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  // ---------- helpers ----------
  const hits = [];
  let hover = null, pressed = null, t = 0, paused = false;
  function txt(s, x, y, o) {
    o = o || {};
    ctx.font = `${o.weight || 700} ${o.size || 20}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = o.align || "left"; ctx.textBaseline = o.base || "middle"; ctx.fillStyle = o.color || "#fff";
    if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
    ctx.fillText(s, x, y); ctx.globalAlpha = 1;
  }
  function btn(id, x, y, w, h, label, o) {
    o = o || {};
    const dis = o.disabled, act = o.active, isH = hover === id && !dis, isP = pressed === id;
    if (!dis) hits.push({ id, x, y, w, h, fn: o.fn });
    ctx.save();
    if (isP) { ctx.translate(x + w / 2, y + h / 2); ctx.scale(0.97, 0.97); ctx.translate(-x - w / 2, -y - h / 2); }
    ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    if (o.primary) { g.addColorStop(0, isH ? "#ffe27a" : "#ffd23f"); g.addColorStop(1, "#f0a91c"); }
    else if (act) { g.addColorStop(0, "#7c5bd6"); g.addColorStop(1, "#5a3fb0"); }
    else { g.addColorStop(0, isH ? "#4a3585" : "#3d2a6e"); g.addColorStop(1, "#2d1f52"); }
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, y, w, h, o.r || 14); ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.lineWidth = act ? 2.5 : 1.5; ctx.strokeStyle = act ? "#ffd23f" : "rgba(255,255,255,.14)"; ctx.stroke();
    ctx.restore();
    const col = dis ? "rgba(255,255,255,.3)" : o.primary ? "#2a1a00" : "#fff";
    txt(label, x + w / 2, y + h / 2 + 1, { size: o.size || 20, weight: 800, align: "center", color: col });
    if (o.sub) txt(o.sub, x + w / 2, y + h - 12, { size: 12, weight: 600, align: "center", color: "rgba(255,255,255,.55)" });
  }

  // ---------- game state ----------
  let screen = "menu", g = null, particles = [], confirmNew = 0;

  function newGame() {
    let human = -1;
    if (settings.mode === "cpu") human = settings.side === "random" ? (Math.random() < 0.5 ? WHITE : BLACK) : settings.side === "black" ? BLACK : WHITE;
    g = {
      pos: new Position(), mode: settings.mode, level: settings.level, human, view: human === BLACK ? 1 : 0,
      sel: -1, legal: [], targets: [], anims: [], ghosts: [], sans: [], last: null, over: null, overT: 0, dismissed: false,
      search: null, token: 0, promo: null, drag: null, cursor: null, submitted: false, score: 0, thinkT: 0,
    };
    g.legal = g.pos.legalMoves();
    E.clearTT();
    particles = []; screen = "game"; confirmNew = 0;
    maybeCpu();
  }
  const isHumanTurn = () => g && !g.over && (g.mode === "two" || g.pos.turn === g.human);

  function maybeCpu() {
    if (!g || g.over || g.mode !== "cpu" || g.pos.turn === g.human || g.search) return;
    const me = g, token = ++g.token, t0 = performance.now();
    const h = E.createSearch(g.pos, { level: g.level });
    g.search = h;
    const minThink = g.level === 1 ? 500 : 650;
    const tick = () => {
      if (g !== me || me.token !== token) return;
      if (paused) { setTimeout(tick, 120); return; }
      if (!h.step(9)) { setTimeout(tick, 0); return; }
      const wait = Math.max(0, minThink - (performance.now() - t0));
      setTimeout(() => {
        if (g !== me || me.token !== token) return;
        me.search = null;
        if (h.result && h.result.move) applyMove(h.result.move);
      }, wait);
    };
    setTimeout(tick, 250);
  }
  function cancelSearch() { if (g) { g.token++; if (g.search) g.search.cancel(); g.search = null; } }

  function sqXY(sq) {
    const f = sq & 7, r = sq >> 3, col = g.view ? 7 - f : f, row = g.view ? r : 7 - r;
    return { x: BX + col * CELL, y: BY + row * CELL };
  }
  function xySq(x, y) {
    const col = Math.floor((x - BX) / CELL), row = Math.floor((y - BY) / CELL);
    if (col < 0 || col > 7 || row < 0 || row > 7) return -1;
    const f = g.view ? 7 - col : col, r = g.view ? row : 7 - row;
    return r * 8 + f;
  }
  function burst(sq, color, n, power) {
    const p = sqXY(sq);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (0.35 + Math.random()) * (power || 160);
      particles.push({ x: p.x + CELL / 2, y: p.y + CELL / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0.5 + Math.random() * 0.5, max: 1, color, size: 2 + Math.random() * 4 });
    }
  }

  function applyMove(m) {
    const pos = g.pos, from = E.mFrom(m), to = E.mTo(m), fl = E.mFlags(m);
    const san = E.moveToSAN(pos, m), mover = pos.board[from];
    const isEp = (fl & F_EP) !== 0;
    const capSq = isEp ? (mover >> 3 ? to + 8 : to - 8) : to, cap = pos.board[capSq];
    g.anims = [{ sq: to, from, t: 0, dur: 0.24 }];
    if (fl & F_CASTLE) g.anims.push({ sq: to > from ? to - 1 : to + 1, from: to > from ? to + 1 : to - 2, t: 0, dur: 0.24 });
    if (cap) { g.ghosts.push({ piece: cap, sq: capSq, t: 0 }); burst(capSq, cap >> 3 ? "#8a8fc8" : "#f4e6c0", 18, 190); }
    pos.make(m);
    g.sans.push(san); g.last = { from, to }; g.sel = -1; g.targets = []; g.promo = null; g.drag = null;
    g.legal = pos.legalMoves();
    const st = pos.status(g.legal);
    if (st.over) endGame(st); else maybeCpu();
  }

  function endGame(st) {
    g.over = st; g.overT = 0; g.dismissed = false;
    const pos = g.pos;
    if (st.result === "checkmate") {
      const loser = pos.turn, ks = pos.kingSq[loser];
      burst(ks, "#ffd23f", 40, 260); burst(ks, "#ff4d6d", 24, 200);
      setTimeout(() => { if (g && g.over) for (let i = 0; i < 6; i++) burst(Math.floor(Math.random() * 64), ["#ffd23f", "#3ddc97", "#4cc9f0", "#ff4d6d", "#b56cff"][i % 5], 10, 200); }, 350);
    }
    if (g.mode === "cpu" && !g.submitted) {
      g.submitted = true;
      const moves = Math.ceil(pos.ply / 2);
      let score = 0;
      if (st.winner === g.human) score = 1000 * g.level + Math.max(0, 400 - moves * 5);
      else if (st.winner === -1) score = 250 * g.level;
      g.score = score;
      if (score > (bestScores[g.level] || 0)) { bestScores[g.level] = score; store.set("royalchess.best", bestScores); }
      if (window.Arcadia) { try { Arcadia.submitScore(score); Arcadia.gameOver(); } catch (e) { /* ignore */ } }
    }
  }

  function selectSq(sq) {
    g.sel = sq;
    g.targets = g.legal.filter((m) => E.mFrom(m) === sq);
  }
  function tryMove(from, to) {
    const ms = g.legal.filter((m) => E.mFrom(m) === from && E.mTo(m) === to);
    if (!ms.length) return false;
    if (ms.length > 1) { g.promo = { from, to, color: g.pos.turn }; g.drag = null; return true; }
    applyMove(ms[0]);
    return true;
  }
  function chooseSq(sq) { // shared by tap, mouse and keyboard
    if (!isHumanTurn() || g.promo) return;
    const p = g.pos.board[sq];
    if (g.sel >= 0 && g.targets.some((m) => E.mTo(m) === sq)) { tryMove(g.sel, sq); return; }
    if (p && (p >> 3) === g.pos.turn && sq !== g.sel) selectSq(sq);
    else { g.sel = -1; g.targets = []; }
  }

  function undo() {
    if (!g || g.pos.ply === 0) return;
    const cpu = g.mode === "cpu";
    let n = 1;
    if (cpu && g.pos.turn === g.human) n = 2;
    if (cpu && g.pos.ply - n < (g.human === BLACK ? 1 : 0)) return;
    if (g.pos.ply - n < 0) return;
    cancelSearch();
    for (let i = 0; i < n; i++) { g.pos.unmake(); g.sans.pop(); }
    const pl = g.pos.ply;
    g.last = pl ? { from: E.mFrom(g.pos.uM[pl - 1]), to: E.mTo(g.pos.uM[pl - 1]) } : null;
    g.anims = []; g.ghosts = []; g.sel = -1; g.targets = []; g.promo = null; g.drag = null; g.over = null; g.submitted = false;
    g.legal = g.pos.legalMoves();
    maybeCpu();
  }

  // ---------- input ----------
  function toLogical(e) {
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }
  function hitAt(p) {
    for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) return h; }
    return null;
  }
  c.addEventListener("pointerdown", (e) => {
    c.focus();
    const p = toLogical(e), h = hitAt(p);
    if (g) g.cursor = null;
    if (h) { pressed = h.id; h.fn(); setTimeout(() => { if (pressed === h.id) pressed = null; }, 120); return; }
    if (screen !== "game" || !g || g.promo) {
      if (g && g.promo) g.promo = null;
      return;
    }
    if (g.over && !g.dismissed) return;
    const sq = xySq(p.x, p.y);
    if (sq < 0) return;
    if (!isHumanTurn()) return;
    const piece = g.pos.board[sq];
    const wasSel = g.sel === sq;
    if (piece && (piece >> 3) === g.pos.turn) {
      if (!wasSel) selectSq(sq);
      g.drag = { from: sq, x: p.x, y: p.y, sx: p.x, sy: p.y, active: false, wasSel };
      try { c.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    } else chooseSq(sq);
  });
  c.addEventListener("pointermove", (e) => {
    const p = toLogical(e), h = hitAt(p);
    hover = h ? h.id : null;
    if (g && g.drag) {
      g.drag.x = p.x; g.drag.y = p.y;
      if (!g.drag.active && Math.hypot(p.x - g.drag.sx, p.y - g.drag.sy) > 9) g.drag.active = true;
    }
  });
  const endDrag = (e) => {
    if (!g || !g.drag) return;
    const d = g.drag; g.drag = null;
    const p = toLogical(e);
    if (d.active) {
      const sq = xySq(p.x, p.y);
      if (sq >= 0 && sq !== d.from && g.targets.some((m) => E.mTo(m) === sq)) tryMove(d.from, sq);
    } else {
      const sq = xySq(p.x, p.y);
      if (sq === d.from && d.wasSel) { g.sel = -1; g.targets = []; }
    }
  };
  c.addEventListener("pointerup", endDrag);
  c.addEventListener("pointercancel", () => { if (g) g.drag = null; });
  c.addEventListener("pointerleave", () => { hover = null; });

  addEventListener("keydown", (e) => {
    const k = e.key;
    if (screen === "menu") { if (k === "Enter" || k === " ") { e.preventDefault(); startFromMenu(); } return; }
    if (!g) return;
    if (g.promo) {
      const map = { q: QUEEN, r: ROOK, b: BISHOP, n: KNIGHT };
      if (map[k.toLowerCase()]) { finishPromo(map[k.toLowerCase()]); return; }
      if (k === "Escape") g.promo = null;
      return;
    }
    if (k === "u" || k === "U" || k === "Backspace") undo();
    else if (k === "n" || k === "N") newGame();
    else if (k === "f" || k === "F") g.view ^= 1;
    else if (k === "m" || k === "M" || k === "Escape") { if (g.sel >= 0) { g.sel = -1; g.targets = []; } else goMenu(); }
    else if (k.startsWith("Arrow")) {
      e.preventDefault();
      if (!g.cursor) g.cursor = { f: 4, r: g.human === BLACK ? 6 : 1 };
      const dx = k === "ArrowLeft" ? -1 : k === "ArrowRight" ? 1 : 0, dy = k === "ArrowUp" ? 1 : k === "ArrowDown" ? -1 : 0;
      const s = g.view ? -1 : 1;
      g.cursor.f = Math.max(0, Math.min(7, g.cursor.f + dx * s)); g.cursor.r = Math.max(0, Math.min(7, g.cursor.r + dy * s));
    } else if ((k === "Enter" || k === " ") && g.cursor) { e.preventDefault(); if (g.over && !g.dismissed) g.dismissed = true; else chooseSq(g.cursor.r * 8 + g.cursor.f); }
  });
  function finishPromo(type) {
    const pr = g.promo; if (!pr) return;
    const m = g.legal.find((mv) => E.mFrom(mv) === pr.from && E.mTo(mv) === pr.to && E.mPromo(mv) === type);
    if (m) applyMove(m);
  }
  function startFromMenu() { store.set("royalchess.settings", settings); newGame(); }
  function goMenu() { screen = "menu"; if (g) { g.drag = null; } }
  if (window.Arcadia) { try { Arcadia.onPause(() => (paused = true)); Arcadia.onResume(() => (paused = false)); } catch (e) { /* ignore */ } }

  // ---------- update ----------
  function update(dt) {
    t += dt;
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt; p.life -= dt; }
    particles = particles.filter((p) => p.life > 0);
    if (confirmNew && performance.now() - confirmNew > 2500) confirmNew = 0;
    if (!g) return;
    g.thinkT += dt;
    for (const a of g.anims) a.t += dt;
    g.anims = g.anims.filter((a) => a.t < a.dur);
    for (const gh of g.ghosts) gh.t += dt;
    g.ghosts = g.ghosts.filter((gh) => gh.t < 0.3);
    if (g.over) g.overT += dt;
  }

  // ---------- drawing ----------
  const LIGHT = "#f0d9b5", DARK = "#b58863";
  function bg() {
    const b = ctx.createLinearGradient(0, 0, 0, H); b.addColorStop(0, "#2a1a4d"); b.addColorStop(1, "#120b22");
    ctx.fillStyle = b; ctx.fillRect(0, 0, W, H);
  }
  function statusText() {
    if (g.over) {
      const o = g.over, w = o.winner;
      if (o.result === "checkmate") return g.mode === "cpu" ? (w === g.human ? "Checkmate - you win!" : "Checkmate - computer wins") : `Checkmate - ${w === WHITE ? "White" : "Black"} wins`;
      return { stalemate: "Draw by stalemate", threefold: "Draw by repetition", fifty: "Draw - fifty-move rule", insufficient: "Draw - insufficient material" }[o.result];
    }
    const chk = g.pos.inCheck(), side = g.pos.turn === WHITE ? "White" : "Black";
    if (g.mode === "cpu") {
      if (g.pos.turn !== g.human) return chk ? "Computer is in check" : "Computer is thinking";
      return chk ? "Check! Your move" : "Your move";
    }
    return chk ? `Check! ${side} to move` : `${side} to move`;
  }
  function capturedBy(color) { // pieces of the opposite colour captured by `color`
    const out = [], pos = g.pos;
    for (let i = 0; i < pos.ply; i++) { const p = pos.uC[i]; if (p && (p >> 3) !== color) out.push(p & 7); }
    return out.sort((a, b) => b - a);
  }
  function matVal(list) { let s = 0; for (const t2 of list) s += [0, 1, 3, 3, 5, 9, 0][t2]; return s; }
  function panel(y, color) {
    const pos = g.pos, active = !g.over && pos.turn === color;
    ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.roundRect(BX, y, BS, 78, 16); ctx.fill();
    if (active) { ctx.strokeStyle = "#ffd23f"; ctx.lineWidth = 2.5; ctx.stroke(); }
    // avatar disc
    const ax = BX + 40, ay = y + 39;
    const gr = ctx.createRadialGradient(ax - 8, ay - 10, 4, ax, ay, 32);
    gr.addColorStop(0, color === WHITE ? "#8d7bd6" : "#5a4aa0"); gr.addColorStop(1, "#2a1d55");
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(ax, ay, 29, 0, Math.PI * 2); ctx.fill();
    drawPiece(KING, color, ax, ay + 1, 44, 1, false);
    let name = color === WHITE ? "White" : "Black";
    let sub = "";
    if (g.mode === "cpu") { if (color === g.human) { name = "You"; sub = color === WHITE ? "playing White" : "playing Black"; } else { name = "Computer"; sub = LEVELS[g.level].name + (color === WHITE ? " - White" : " - Black"); } }
    else sub = "Player " + (color === WHITE ? "1" : "2");
    txt(name, BX + 80, y + 24, { size: 22, weight: 800 });
    txt(sub, BX + 80, y + 46, { size: 13, weight: 600, color: "rgba(255,255,255,.55)" });
    if (active) {
      ctx.fillStyle = "#ffd23f"; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
      ctx.beginPath(); ctx.arc(BX + BS - 22, y + 20, 6, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
    if (g.mode === "cpu" && color !== g.human && g.search && !g.over) {
      for (let i = 0; i < 3; i++) { ctx.fillStyle = "#fff"; ctx.globalAlpha = 0.25 + 0.75 * Math.max(0, Math.sin(g.thinkT * 6 - i * 0.9)); ctx.beginPath(); ctx.arc(BX + 166 + i * 14, y + 24, 4, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    // captured tray
    const mine = capturedBy(color), theirs = capturedBy(color ^ 1), diff = matVal(mine) - matVal(theirs);
    let x = BX + 80;
    for (let i = 0; i < mine.length; i++) {
      if (i && mine[i] !== mine[i - 1]) x += 8;
      drawPiece(mine[i], color ^ 1, x + 11, y + 60, 24, 1, false); x += mine[i] === PAWN ? 10 : 15;
    }
    if (diff > 0) txt("+" + diff, x + 14, y + 61, { size: 14, weight: 800, color: "#7dffb5" });
  }

  function drawBoard() {
    // frame
    const fr = ctx.createLinearGradient(0, BY - 10, 0, BY + BS + 10); fr.addColorStop(0, "#6b4426"); fr.addColorStop(1, "#3a2313");
    ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
    ctx.fillStyle = fr; ctx.beginPath(); ctx.roundRect(BX - 7, BY - 7, BS + 14, BS + 14, 12); ctx.fill();
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = "rgba(255,220,160,.25)"; ctx.lineWidth = 1.5; ctx.stroke();
    const pos = g.pos;
    const checkSq = pos.inCheck() ? pos.kingSq[pos.turn] : -1;
    for (let sq = 0; sq < 64; sq++) {
      const { x, y } = sqXY(sq), f = sq & 7, r = sq >> 3, light = (f + r) % 2 === 1;
      const sg = ctx.createLinearGradient(x, y, x + CELL, y + CELL);
      sg.addColorStop(0, light ? "#f6e3c2" : "#c0946a"); sg.addColorStop(1, light ? "#ead2a8" : "#ab7d55");
      ctx.fillStyle = sg; ctx.fillRect(x, y, CELL, CELL);
      if (g.last && (sq === g.last.from || sq === g.last.to)) { ctx.fillStyle = "rgba(255,214,64,.45)"; ctx.fillRect(x, y, CELL, CELL); }
      if (sq === g.sel) { ctx.fillStyle = "rgba(90,220,140,.5)"; ctx.fillRect(x, y, CELL, CELL); }
      if (sq === checkSq) {
        const rg = ctx.createRadialGradient(x + CELL / 2, y + CELL / 2, 4, x + CELL / 2, y + CELL / 2, CELL * 0.72);
        rg.addColorStop(0, "rgba(255,40,60,.95)"); rg.addColorStop(0.55, "rgba(255,40,60,.5)"); rg.addColorStop(1, "rgba(255,40,60,0)");
        ctx.fillStyle = rg; ctx.fillRect(x, y, CELL, CELL);
      }
    }
    // gloss
    const gl = ctx.createLinearGradient(BX, BY, BX + BS, BY + BS); gl.addColorStop(0, "rgba(255,255,255,.10)"); gl.addColorStop(0.5, "rgba(255,255,255,0)"); gl.addColorStop(1, "rgba(0,0,0,.08)");
    ctx.fillStyle = gl; ctx.fillRect(BX, BY, BS, BS);
    // legal move hints
    for (const m of g.targets) {
      const to = E.mTo(m), { x, y } = sqXY(to), cx = x + CELL / 2, cy = y + CELL / 2;
      if (pos.board[to] || (E.mFlags(m) & F_EP)) {
        ctx.strokeStyle = "rgba(20,20,40,.42)"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.43, 0, Math.PI * 2); ctx.stroke();
      } else { ctx.fillStyle = "rgba(20,20,40,.36)"; ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.16, 0, Math.PI * 2); ctx.fill(); }
    }
    // pieces
    const animSq = new Map(); for (const a of g.anims) animSq.set(a.sq, a);
    const dragSq = g.drag && g.drag.active ? g.drag.from : -1;
    const late = [];
    for (let sq = 0; sq < 64; sq++) {
      const p = pos.board[sq]; if (!p || sq === dragSq) continue;
      const a = animSq.get(sq);
      const { x, y } = sqXY(sq);
      if (a) { late.push({ p, a, x, y }); continue; }
      drawPiece(p & 7, p >> 3, x + CELL / 2, y + CELL / 2, CELL * 0.94);
    }
    for (const gh of g.ghosts) {
      const { x, y } = sqXY(gh.sq), k = gh.t / 0.3;
      drawPiece(gh.piece & 7, gh.piece >> 3, x + CELL / 2, y + CELL / 2, CELL * 0.94 * (1 - k * 0.4), 1 - k, false);
    }
    for (const l of late) {
      const from = sqXY(l.a.from), k = Math.min(1, l.a.t / l.a.dur), e = 1 - Math.pow(1 - k, 3);
      const px = from.x + (l.x - from.x) * e, py = from.y + (l.y - from.y) * e, lift = Math.sin(k * Math.PI) * 4;
      drawPiece(l.p & 7, l.p >> 3, px + CELL / 2, py + CELL / 2 - lift, CELL * 0.94 * (1 + Math.sin(k * Math.PI) * 0.06));
    }
    if (g.drag && g.drag.active) {
      const d = g.drag, p = pos.board[d.from], sq = xySq(d.x, d.y);
      if (sq >= 0) { const q = sqXY(sq); ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 3; ctx.strokeRect(q.x + 1.5, q.y + 1.5, CELL - 3, CELL - 3); }
      if (p) drawPiece(p & 7, p >> 3, d.x, d.y - 14, CELL * 1.18);
    }
    // coordinates (drawn over the pieces, tucked into the corners)
    for (let i = 0; i < 8; i++) {
      const f = g.view ? 7 - i : i, r = g.view ? i : 7 - i;
      txt("abcdefgh"[f], BX + i * CELL + CELL - 3, BY + BS - 7, { size: 10, weight: 800, align: "right", color: ((f + (g.view ? 7 : 0)) % 2) === 1 ? "#8f6540" : "#f0d9b5", alpha: 0.95 });
      txt(String(r + 1), BX + 3, BY + i * CELL + 9, { size: 10, weight: 800, color: (((g.view ? 7 : 0) + r) % 2) === 1 ? "#8f6540" : "#f0d9b5", alpha: 0.95 });
    }
    if (g.cursor) {
      const sq = g.cursor.r * 8 + g.cursor.f, { x, y } = sqXY(sq);
      ctx.strokeStyle = "#4cc9f0"; ctx.lineWidth = 3.5; ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
    }
  }

  function drawModalPromo() {
    hits.length = 0;
    ctx.fillStyle = "rgba(10,6,24,.6)"; ctx.fillRect(0, 0, W, H);
    const pw = 4 * 92 + 40, px = (W - pw) / 2, py = BY + BS / 2 - 90;
    ctx.fillStyle = "#2b1c52"; ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 24; ctx.beginPath(); ctx.roundRect(px, py, pw, 180, 20); ctx.fill(); ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
    ctx.strokeStyle = "#ffd23f"; ctx.lineWidth = 2; ctx.stroke();
    txt("Promote pawn to", W / 2, py + 28, { size: 20, weight: 800, align: "center" });
    [QUEEN, ROOK, BISHOP, KNIGHT].forEach((tp, i) => {
      const bx = px + 20 + i * 92, by = py + 54, id = "promo" + tp;
      hits.push({ id, x: bx, y: by, w: 84, h: 106, fn: () => finishPromo(tp) });
      ctx.fillStyle = hover === id ? "rgba(255,210,63,.28)" : "rgba(255,255,255,.08)"; ctx.beginPath(); ctx.roundRect(bx, by, 84, 106, 14); ctx.fill();
      drawPiece(tp, g.promo.color, bx + 42, by + 50, 76);
      txt("QRBN"[[QUEEN, ROOK, BISHOP, KNIGHT].indexOf(tp)] === "Q" ? "Queen" : tp === ROOK ? "Rook" : tp === BISHOP ? "Bishop" : "Knight", bx + 42, by + 96, { size: 13, weight: 700, align: "center", color: "rgba(255,255,255,.7)" });
    });
    txt("Tap anywhere else to cancel", W / 2, py + 196, { size: 13, weight: 600, align: "center", color: "rgba(255,255,255,.5)" });
  }
  function drawModalOver() {
    hits.length = 0;
    const k = Math.min(1, (g.overT - 0.9) / 0.35);
    ctx.fillStyle = `rgba(10,6,24,${0.62 * k})`; ctx.fillRect(0, 0, W, H);
    const pw = 400, ph = g.mode === "cpu" ? 316 : 262, px = (W - pw) / 2, py = BY + BS / 2 - ph / 2 + 10 + (1 - k) * 30;
    ctx.save(); ctx.globalAlpha = k;
    ctx.fillStyle = "#2b1c52"; ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 24; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 22); ctx.fill(); ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
    ctx.strokeStyle = "#ffd23f"; ctx.lineWidth = 2; ctx.stroke();
    const o = g.over, won = g.mode === "cpu" && o.winner === g.human, lost = g.mode === "cpu" && o.winner >= 0 && !won;
    const head = o.winner >= 0 ? (g.mode === "cpu" ? (won ? "You win!" : "You lose") : (o.winner === WHITE ? "White wins!" : "Black wins!")) : "Draw";
    txt(head, W / 2, py + 50, { size: 38, weight: 900, align: "center", color: won || (g.mode === "two" && o.winner >= 0) ? "#ffd23f" : "#fff" });
    txt(statusText(), W / 2, py + 88, { size: 16, weight: 600, align: "center", color: "rgba(255,255,255,.7)" });
    let y = py + 120;
    if (g.mode === "cpu") {
      txt(`Score ${g.score}  -  Best (${LEVELS[g.level].name}) ${bestScores[g.level] || 0}`, W / 2, y, { size: 17, weight: 700, align: "center", color: "#d9c8ff" }); y += 34;
    }
    void lost;
    btn("again", px + 30, y, pw - 60, 56, "Play again", { primary: true, fn: () => newGame() }); y += 66;
    btn("review", px + 30, y, (pw - 70) / 2, 50, "Review board", { size: 16, fn: () => { g.dismissed = true; } });
    btn("menu2", px + 40 + (pw - 70) / 2, y, (pw - 70) / 2, 50, "Menu", { size: 16, fn: () => goMenu() });
    ctx.restore();
  }

  function drawGame() {
    // header
    txt("Royal Chess", 24, 34, { size: 30, weight: 900 });
    txt(g.mode === "cpu" ? `vs Computer - ${LEVELS[g.level].name}` : "Two players", W - 24, 34, { size: 16, weight: 700, align: "right", color: "#d9c8ff" });
    const topColor = g.view ? WHITE : BLACK, botColor = g.view ? BLACK : WHITE;
    panel(78, topColor);
    drawBoard();
    panel(BY + BS + 14, botColor);
    // status
    const st = statusText(), chk = !g.over && g.pos.inCheck();
    txt(st, W / 2, 790, { size: 24, weight: 900, align: "center", color: g.over ? "#ffd23f" : chk ? "#ff8095" : "#fff" });
    // buttons
    const bw = 108, by = 812, gap = 8, x0 = (W - (4 * bw + 3 * gap)) / 2;
    const canUndo = g.pos.ply > (g.mode === "cpu" && g.human === BLACK ? 1 : 0);
    btn("undo", x0, by, bw, 60, "Undo", { disabled: !canUndo, fn: undo });
    btn("new", x0 + (bw + gap), by, bw, 60, confirmNew ? "Sure?" : "New game", { active: !!confirmNew, size: 16, fn: () => { if (g.over || g.pos.ply === 0 || confirmNew) newGame(); else confirmNew = performance.now(); } });
    btn("flip", x0 + 2 * (bw + gap), by, bw, 60, "Flip", { fn: () => { g.view ^= 1; } });
    btn("menu", x0 + 3 * (bw + gap), by, bw, 60, "Menu", { fn: goMenu });
    // move strip
    const sans = g.sans; let s = "";
    for (let i = 0; i < sans.length; i++) s += (i % 2 === 0 ? (i / 2 + 1) + ". " : "") + sans[i] + (i % 2 === 0 ? " " : "   ");
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.roundRect(BX, 890, BS, 40, 12); ctx.fill();
    ctx.font = "700 16px system-ui, sans-serif";
    let shown = s.trim();
    if (!shown) shown = "Moves will appear here";
    else { let cut = false; while (ctx.measureText((cut ? "... " : "") + shown).width > BS - 28 && shown.length > 4) { shown = shown.slice(2); cut = true; } if (cut) shown = "... " + shown.replace(/^\S*\s/, ""); }
    txt(shown, BX + 14, 911, { size: 16, weight: 700, color: sans.length ? "#e8defc" : "rgba(255,255,255,.4)" });
    // particles
    for (const p of particles) { ctx.globalAlpha = Math.min(1, p.life * 2.2); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    if (g.promo) drawModalPromo();
    else if (g.over && !g.dismissed && g.overT > 0.9) drawModalOver();
  }

  function startMenuBtns() {
    const cpu = settings.mode === "cpu";
    txt("GAME MODE", 24, 468, { size: 13, weight: 800, color: "#a898d8" });
    btn("m-cpu", 24, 484, 210, 62, "vs Computer", { active: cpu, fn: () => { settings.mode = "cpu"; } });
    btn("m-two", 246, 484, 210, 62, "2 Players", { active: !cpu, fn: () => { settings.mode = "two"; } });
    ctx.globalAlpha = cpu ? 1 : 0.35;
    txt("DIFFICULTY", 24, 580, { size: 13, weight: 800, color: "#a898d8" });
    const names = ["Easy", "Medium", "Hard", "Master"], bw = 104;
    for (let i = 0; i < 4; i++) btn("lv" + (i + 1), 24 + i * (bw + 5.3), 596, bw, 62, names[i], { active: settings.level === i + 1, disabled: !cpu, size: 18, fn: () => { settings.level = i + 1; } });
    txt("PLAY AS", 24, 692, { size: 13, weight: 800, color: "#a898d8" });
    const sides = [["white", "White"], ["black", "Black"], ["random", "Random"]];
    for (let i = 0; i < 3; i++) btn("sd-" + sides[i][0], 24 + i * 145.3, 708, 141, 62, sides[i][1], { active: settings.side === sides[i][0], disabled: !cpu, fn: () => { settings.side = sides[i][0]; } });
    ctx.globalAlpha = 1;
    btn("play", 24, 804, 432, 76, "Play", { primary: true, size: 30, fn: startFromMenu });
    if (g && !g.over) btn("resume", 24, 892, 432, 44, "Resume game", { size: 16, fn: () => { screen = "game"; } });
    else if (cpu) txt(`Best score (${LEVELS[settings.level].name}): ${bestScores[settings.level] || 0}`, W / 2, 914, { size: 15, weight: 700, align: "center", color: "#a898d8" });
  }
  function drawMenu() {
    // faint checker
    ctx.save(); ctx.globalAlpha = 0.05; ctx.fillStyle = "#fff";
    for (let r = 0; r < 20; r++) for (let q = 0; q < 10; q++) if ((r + q) % 2) ctx.fillRect(q * 48, r * 48, 48, 48);
    ctx.restore();
    txt("ROYAL", W / 2, 96, { size: 30, weight: 800, align: "center", color: "#ffd23f" });
    txt("Chess", W / 2, 152, { size: 66, weight: 900, align: "center" });
    // hero pieces
    const by = 300, bob = Math.sin(t * 1.6) * 3;
    ctx.fillStyle = "rgba(255,255,255,.06)"; ctx.beginPath(); ctx.ellipse(W / 2, by + 78, 190, 26, 0, 0, Math.PI * 2); ctx.fill();
    drawPiece(KNIGHT, BLACK, 110, by + 20 - bob, 118);
    drawPiece(ROOK, WHITE, 370, by + 20 + bob, 118);
    drawPiece(QUEEN, BLACK, 190, by + 12 + bob, 150);
    drawPiece(KING, WHITE, 292, by + 4 - bob, 168);
    txt("Full rules. Four AI levels. Pass and play.", W / 2, 424, { size: 16, weight: 600, align: "center", color: "#cbbdf0" });
    startMenuBtns();
  }

  function draw() {
    hits.length = 0;
    bg();
    if (screen === "menu") drawMenu(); else drawGame();
    if (screen === "menu") { for (const p of particles) { ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 3, 3); } }
  }

  let last = performance.now();
  function loop(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; if (!paused) update(dt); draw(); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
  window.__royalChess = { get g() { return g; }, get screen() { return screen; }, sqXY, settings, newGame };
})();
