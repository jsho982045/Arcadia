// Backgammon Club — an Arcadia seed game. Rules and AI live in engine.js (window.BG); this file is the canvas UI.
(() => {
  const E = window.BG;
  const W = 420, H = 800;
  const c = document.getElementById("c");
  const ctx = c.getContext("2d");
  let scale = 1, dpr = 1, boardLayer = null;
  function fit() {
    scale = Math.min(innerWidth / W, innerHeight / H); dpr = window.devicePixelRatio || 1;
    c.style.width = W * scale + "px"; c.style.height = H * scale + "px";
    c.width = Math.round(W * scale * dpr); c.height = Math.round(H * scale * dpr);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    boardLayer = null;
  }
  addEventListener("resize", fit); fit();

  // ---------- layout ----------
  const PW = 30, R = 13, BX = 6, BY = 112, BW = 408, PAD = 14, QH = 232, BAND = 72;
  const Y0 = BY + PAD, BANDY = Y0 + QH, Y1 = BANDY + BAND, BH = PAD * 2 + QH * 2 + BAND;
  const LX0 = 15, RX0 = 405, SPINE0 = 195, SPINE1 = 225, MIDX = 210;
  const TOP_Y = 60, STRIP_H = 48, BOT_Y = BY + BH + 4, BTN_Y = BOT_Y + STRIP_H + 8, BTN_H = 54;
  // upright board, seen from White's seat: points 1-12 run along the near (bottom) edge right-to-left, 13-24 along the far edge left-to-right
  const isTop = (i) => i >= 12;
  const colOf = (i) => (i >= 12 ? i - 12 : 11 - i);
  const colX = (c) => (c < 6 ? LX0 + c * PW : SPINE1 + (c - 6) * PW);
  const ptX = (i) => colX(colOf(i)) + PW / 2;
  const TRAY_X = 214, TRAY_W = 192;
  const stripY = (p) => (p === 1 ? TOP_Y : BOT_Y);

  // ---------- state ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("backgammon." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("backgammon." + k, JSON.stringify(v)); } catch (e) {} },
  };
  const cfg = Object.assign({ mode: "cpu", level: "medium", target: 3, cubeOn: true }, store.get("cfg", {}));
  const stats = Object.assign({ wins: 0, losses: 0, matches: 0 }, store.get("stats", {}));
  let G = null;            // current match/game
  let phase = "title";     // title | opening | roll | rolling | move | noMoves | cpu | offer | gameEnd | matchEnd
  let t = 0, paused = false, timers = [], tok = 0, pendCounter = 0;
  let flights = [], hidden = {}, ui = [], toast = null, diceAnim = null, drag = null, sel = null, hint = null;
  let pointerXY = { x: 0, y: 0 };
  const isCpu = () => cfg.mode === "cpu";
  const isHuman = (p) => !isCpu() || p === 0;
  const nameOf = (p) => (isCpu() ? (p === 0 ? "You" : "Computer") : p === 0 ? "White" : "Black");
  const longName = (p) => (isCpu() ? (p === 0 ? "You (White)" : "Computer · " + cap(cfg.level)) : p === 0 ? "Player 1 · White" : "Player 2 · Black");
  const cap = (s) => s[0].toUpperCase() + s.slice(1);

  function after(ms, fn) { timers.push({ ms, fn, tok }); }
  function toastMsg(text, dur) { toast = { text, life: dur || 1.5, max: dur || 1.5 }; }

  function newMatch() {
    tok++; timers = []; flights = []; hidden = {}; sel = null; hint = null; drag = null;
    G = { score: [0, 0], cube: { v: 1, owner: -1 }, game: 0, s: null, turn: 0, dice: [], rem: [], maxLen: 0, played: [], undo: [], last: null, queue: false, result: null, status: "" };
    newGame();
  }
  function newGame() {
    tok++; timers = []; flights = []; hidden = {}; sel = null; hint = null; drag = null;
    G.s = E.newState(); G.cube = { v: 1, owner: -1 }; G.game++; G.dice = []; G.rem = []; G.played = []; G.undo = []; G.last = null; G.result = null; G.queue = false;
    phase = "opening"; G.status = "Opening roll";
    const o = E.openingRoll();
    diceAnim = { t: 0, dur: 0.9, vals: o.dice, opening: true };
    after(1000, () => {
      diceAnim = null; G.dice = o.dice; G.turn = o.first;
      toastMsg(nameOf(o.first) + (o.first === 0 && isCpu() ? " go first" : " goes first"), 1.6);
      G.openDice = true;
      after(900, () => beginMoves());
    });
  }

  // ---------- turn flow ----------
  function startTurn() {
    G.dice = []; G.rem = []; G.played = []; G.undo = []; G.queue = false; sel = null; hint = null; G.openDice = false;
    phase = "roll";
    G.status = isHuman(G.turn) ? (isCpu() ? "Your turn — roll the dice" : nameOf(G.turn) + " to roll") : "Computer's turn";
    if (!isHuman(G.turn)) after(650, cpuStartTurn);
  }
  function canDouble(p) {
    return cfg.cubeOn && cfg.target > 1 && phase === "roll" && G.turn === p && (G.cube.owner === -1 || G.cube.owner === p) && G.cube.v < 64;
  }
  function cpuStartTurn() {
    if (canDouble(G.turn) && E.aiShouldDouble(G.s, G.turn, cfg.level)) return offerDouble(G.turn);
    rollDice();
  }
  function offerDouble(d) {
    const r = 1 - d, nv = G.cube.v * 2;
    if (isHuman(r)) { phase = "offer"; G.offer = { from: d, to: r, nv }; G.status = nameOf(d) + (d === 1 && isCpu() ? " doubles you" : " doubles") + " to " + nv; return; }
    // computer decides
    phase = "cpu"; G.status = "Computer is considering the double…"; toastMsg("Double to " + nv + "!", 1.4);
    after(1500, () => {
      if (E.aiShouldTake(G.s, r, cfg.level)) resolveDouble(d, true);
      else resolveDouble(d, false);
    });
  }
  function resolveDouble(d, take) {
    const r = 1 - d;
    if (take) {
      G.cube.v *= 2; G.cube.owner = r; toastMsg((isHuman(r) && isCpu() ? "You take" : nameOf(r) + " takes") + " — cube at " + G.cube.v, 1.6);
      phase = "roll"; G.status = "Cube at " + G.cube.v;
      after(900, () => { if (!isHuman(d)) rollDice(); else { G.status = "Your turn — roll the dice"; } });
    } else {
      toastMsg(nameOf(r) + " drops", 1.4);
      after(900, () => endGame(d, 1, "drop"));
    }
  }
  function rollDice() {
    if (phase !== "roll") return;
    phase = "rolling"; hint = null;
    const vals = E.rollDice();
    diceAnim = { t: 0, dur: 0.85, vals };
    G.status = nameOf(G.turn) + " rolling…";
    after(900, () => { diceAnim = null; G.dice = vals; beginMoves(); });
  }
  function beginMoves() {
    G.rem = E.turnDice(G.dice); G.played = []; G.undo = []; G.maxLen = E.maxPlay(G.s, G.turn, G.rem); sel = null;
    if (G.maxLen === 0) {
      phase = "noMoves"; G.status = "No legal moves"; toastMsg("No legal moves!", 1.7);
      after(1800, endTurn); return;
    }
    if (isHuman(G.turn)) { phase = "move"; G.status = (isCpu() ? "Your move" : nameOf(G.turn) + " to move") + " — " + G.maxLen + (G.maxLen === 1 ? " move" : " moves"); }
    else {
      phase = "cpu"; G.status = "Computer is thinking…";
      const start = performance.now(), myTok = tok;
      E.choosePlayAsync(G.s, G.turn, G.dice, cfg.level, { budgetMs: 1100 }, (play) => {
        if (myTok !== tok) return;
        const wait = Math.max(250, 700 - (performance.now() - start));
        after(wait / 1, () => runMoves(play.moves, () => after(650, endTurn), 620));
      });
    }
  }
  function runMoves(list, done, gap) {
    G.queue = true; hint = null;
    let i = 0;
    (function step() {
      if (i >= list.length) { G.queue = false; return done && done(); }
      const m = list[i++]; doMove(m);
      if (phase === "gameEndPending") { G.queue = false; return; }
      after(gap || 260, step);
    })();
  }
  function doMove(m) {
    const p = G.turn;
    G.undo.push({ s: G.s, rem: G.rem.slice() });
    const from = m.f === E.BAR ? slotXY("bar" + p, G.s.bar[p] - 1, G.s.bar[p]) : slotXY("p" + m.f, Math.abs(G.s.pts[m.f]) - 1, Math.abs(G.s.pts[m.f]));
    let hitFrom = null;
    if (m.hit) hitFrom = slotXY("p" + m.t, 0, 1);
    const ns = E.applyMove(G.s, p, m);
    G.s = ns; G.played.push(m);
    const di = G.rem.indexOf(m.d); if (di >= 0) G.rem.splice(di, 1);
    if (m.t === E.OFF) fly(from, "off" + p, ns.off[p] - 1, ns.off[p], p);
    else fly(from, "p" + m.t, Math.abs(ns.pts[m.t]) - 1, Math.abs(ns.pts[m.t]), p);
    if (m.hit) { fly(hitFrom, "bar" + (1 - p), ns.bar[1 - p] - 1, ns.bar[1 - p], 1 - p, 0.05); toastMsg("Hit!", 1.0); }
    sel = null; hint = null;
    if (E.winner(ns) >= 0) {
      phase = "gameEndPending"; G.status = "";
      G.last = { p, moves: G.played.slice() };
      after(900, () => endGame(E.winner(ns), E.gameResult(ns).mult, "win"));
      return;
    }
    if (isHuman(p)) checkAutoEnd();
  }
  function checkAutoEnd() {
    const lm = E.legalMoves(G.s, G.turn, G.rem, G.maxLen, G.played.length);
    if (lm.length === 0) {
      const mine = (G.pend = ++pendCounter);
      G.status = "Turn complete";
      after(1300, () => { if (G.pend === mine && phase === "move") endTurn(); });
    } else G.status = (isCpu() ? "Your move" : nameOf(G.turn) + " to move") + " — " + (G.maxLen - G.played.length) + " left";
  }
  function endTurn() {
    G.pend = 0;
    if (E.winner(G.s) >= 0) return;
    G.last = { p: G.turn, moves: G.played.slice() };
    G.turn = 1 - G.turn; sel = null; hint = null;
    startTurn();
  }
  function undo() {
    if (phase !== "move" || G.queue || !G.undo.length) return;
    const u = G.undo.pop(); G.s = u.s; G.rem = u.rem; G.played.pop();
    G.pend = 0; // cancels a pending auto end
    flights = []; hidden = {}; sel = null; hint = null;
    G.status = (isCpu() ? "Your move" : nameOf(G.turn) + " to move") + " — " + (G.maxLen - G.played.length) + " left";
  }
  function endGame(w, mult, why) {
    const res = { winner: w, mult, why, kind: mult === 3 ? "backgammon" : mult === 2 ? "gammon" : "single", cube: G.cube.v, pts: G.cube.v * mult };
    G.score[w] += res.pts; G.result = res;
    const done = G.score[w] >= cfg.target;
    phase = done ? "matchEnd" : "gameEnd"; G.status = "";
    if (done) {
      if (isCpu()) {
        const won = w === 0, mm = { easy: 1, medium: 2, hard: 3 }[cfg.level];
        stats.matches++; if (won) stats.wins++; else stats.losses++; store.set("stats", stats);
        const score = mm * (G.score[0] * 100 + (won ? 500 : 50));
        if (window.Arcadia) { try { Arcadia.submitScore(score); Arcadia.gameOver(); } catch (e) {} }
        G.finalScore = score;
      }
    }
  }

  // ---------- geometry ----------
  function slotXY(key, i, n) {
    if (key[0] === "p") {
      const idx = +key.slice(1);
      const sp = Math.min(2 * R + 1, (QH - 2 * R - 12) / Math.max(1, n - 1));
      const off = R + 5 + i * sp;
      return { x: ptX(idx), y: isTop(idx) ? Y0 + off : Y0 + 2 * QH + BAND - off };
    }
    if (key.slice(0, 3) === "bar") {
      const p = +key[3], sp = Math.min(2 * R + 2, (QH - 2 * R - 12) / Math.max(1, n - 1)), off = 18 + R + i * sp, my = BANDY + BAND / 2;
      return { x: MIDX, y: p === 0 ? my + off : my - off };
    }
    const p = +key[3]; // off tray
    return { x: TRAY_X + 8 + (i + 0.5) * ((TRAY_W - 16) / 15), y: stripY(p) + STRIP_H / 2, flat: true };
  }
  function hitTest(x, y) {
    for (let p = 0; p < 2; p++) if (y >= stripY(p) && y <= stripY(p) + STRIP_H && x >= 130) return { kind: "off", p };
    if (y < Y0 || y > Y0 + 2 * QH + BAND || x < LX0 || x > RX0) return null;
    if (x >= SPINE0 && x <= SPINE1) return { kind: "bar", p: y > BANDY + BAND / 2 ? 0 : 1 };
    if (y >= BANDY && y < Y1) return { kind: "dice" };
    const c = x < SPINE0 ? Math.floor((x - LX0) / PW) : 6 + Math.floor((x - SPINE1) / PW);
    return { kind: "pt", idx: y < BANDY ? 12 + c : 11 - c };
  }

  // ---------- selection / destinations ----------
  function movableFrom() {
    if (phase !== "move" || G.queue) return new Set();
    const lm = E.legalMoves(G.s, G.turn, G.rem, G.maxLen, G.played.length);
    return new Set(lm.map((m) => m.f));
  }
  function computeDests(from) {
    const res = new Map();
    let frontier = [{ s: G.s, rem: G.rem, pl: G.played.length, cur: from, path: [] }];
    for (let depth = 0; depth < 4 && frontier.length; depth++) {
      const next = [];
      for (const n of frontier) {
        const lm = E.legalMoves(n.s, G.turn, n.rem, G.maxLen, n.pl).filter((m) => m.f === n.cur);
        for (const m of lm) {
          const path = n.path.concat([m]), key = m.t === E.OFF ? "off" : m.t;
          const ex = res.get(key);
          const midHit = (pa) => pa.slice(0, -1).some((x) => x.hit);
          if (!ex || (ex.length === path.length && midHit(ex) && !midHit(path)) || (m.t === E.OFF && ex.length === path.length && m.d < ex[ex.length - 1].d)) res.set(key, path);
          if (m.t !== E.OFF) {
            const rem = n.rem.slice(); rem.splice(rem.indexOf(m.d), 1);
            next.push({ s: E.applyMove(n.s, G.turn, m), rem, pl: n.pl + 1, cur: m.t, path });
          }
        }
      }
      frontier = next;
    }
    return res;
  }
  function select(from) { sel = { from, dests: computeDests(from) }; }
  function playPath(path) {
    sel = null; runMoves(path, null, 240);
  }
  function tapAt(x, y) {
    if (phase === "roll" && isHuman(G.turn)) { const h = hitTest(x, y); if (h && h.kind === "dice") return rollDice(); }
    if (phase !== "move" || G.queue || !isHuman(G.turn)) return;
    const h = hitTest(x, y); if (!h) { sel = null; return; }
    const p = G.turn;
    if (sel) {
      const key = h.kind === "pt" ? h.idx : h.kind === "off" && h.p === p ? "off" : null;
      if (key !== null && sel.dests.has(key)) return playPath(sel.dests.get(key));
    }
    const mv = movableFrom();
    let from = h.kind === "pt" && G.s.pts[h.idx] * (p === 0 ? 1 : -1) > 0 ? h.idx : h.kind === "bar" && h.p === p && G.s.bar[p] > 0 ? E.BAR : null;
    if (from === null) { sel = null; return; }
    if (!mv.has(from)) {
      sel = null;
      toastMsg(G.s.bar[p] > 0 && from !== E.BAR ? "Enter from the bar first" : "That checker can't move", 1.2);
      return;
    }
    if (sel && sel.from === from) { // second tap: play its biggest single move
      let best = null;
      for (const [k, path] of sel.dests) if (path.length === 1 && (!best || path[0].d > best[0].d)) best = path;
      if (best) return playPath(best);
      sel = null; return;
    }
    select(from);
  }

  // ---------- input ----------
  function toLogical(e) { const r = c.getBoundingClientRect(); return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height }; }
  let press = null;
  c.addEventListener("pointerdown", (e) => {
    e.preventDefault(); try { c.setPointerCapture(e.pointerId); } catch (er) {}
    const q = toLogical(e); pointerXY = q;
    press = { x: q.x, y: q.y, btn: ui.find((b) => b.enabled !== false && q.x >= b.x && q.x <= b.x + b.w && q.y >= b.y && q.y <= b.y + b.h) || null, drag: null };
    if (!press.btn && phase === "move" && !G.queue && isHuman(G.turn)) {
      const h = hitTest(q.x, q.y), p = G.turn;
      if (h) {
        const from = h.kind === "pt" && G.s.pts[h.idx] * (p === 0 ? 1 : -1) > 0 ? h.idx : h.kind === "bar" && h.p === p && G.s.bar[p] > 0 ? E.BAR : null;
        if (from !== null && movableFrom().has(from)) press.cand = from;
      }
    }
  });
  c.addEventListener("pointermove", (e) => {
    const q = toLogical(e); pointerXY = q;
    if (!press || !press.cand && press.cand !== 0) return;
    if (!press.drag && Math.hypot(q.x - press.x, q.y - press.y) > 10 && press.cand !== undefined) {
      const from = press.cand;
      if (!sel || sel.from !== from) select(from);
      const key = from === E.BAR ? "bar" + G.turn : "p" + from;
      hidden[key] = (hidden[key] || 0) + 1;
      press.drag = { key, from };
    }
  });
  function endDrag() { if (press && press.drag) { hidden[press.drag.key]--; } }
  c.addEventListener("pointerup", (e) => {
    const q = toLogical(e); pointerXY = q;
    if (!press) return;
    const pr = press; press = null;
    if (pr.drag) {
      hidden[pr.drag.key]--;
      const h = hitTest(q.x, q.y - 22), p = G.turn;
      const key = h && h.kind === "pt" ? h.idx : h && h.kind === "off" && h.p === p ? "off" : null;
      if (sel && key !== null && sel.dests.has(key)) return playPath(sel.dests.get(key));
      sel = null; return;
    }
    if (pr.btn) {
      const b = ui.find((x) => x.id === pr.btn.id && q.x >= x.x && q.x <= x.x + x.w && q.y >= x.y && q.y <= x.y + x.h);
      if (b && b.enabled !== false) b.fn();
      return;
    }
    tapAt(q.x, q.y);
  });
  c.addEventListener("pointercancel", () => { endDrag(); press = null; });
  addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") { if (phase === "roll" && isHuman(G.turn)) rollDice(); else if (phase === "move" && G.pend) endTurn(); }
    else if (e.key === "u" || e.key === "Backspace") undo();
  });
  if (window.Arcadia) { try { Arcadia.onPause(() => (paused = true)); Arcadia.onResume(() => (paused = false)); } catch (e) {} }
  document.addEventListener("visibilitychange", () => { if (document.hidden) paused = true; else if (!window.Arcadia) paused = false; });

  function showHint() {
    if (phase !== "move" || G.queue) return;
    const plays = E.genPlays(G.s, G.turn, G.rem);
    let best = null, bv = -Infinity;
    for (const pl of plays) { if (pl.moves.length < G.maxLen - G.played.length) continue; const v = E.evaluate(pl.state, G.turn); if (v > bv) { bv = v; best = pl; } }
    if (best) { hint = best.moves[0]; select(hint.f); sel.hint = true; }
  }

  // ---------- update ----------
  function ease(u) { return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; }
  function update(dt) {
    t += dt;
    for (const tm of timers) tm.ms -= dt * 1000;
    const due = timers.filter((x) => x.ms <= 0);
    if (due.length) { timers = timers.filter((x) => x.ms > 0); for (const d of due) if (d.tok === tok) d.fn(); }
    if (diceAnim) diceAnim.t += dt;
    if (toast) { toast.life -= dt; if (toast.life <= 0) toast = null; }
    for (const f of flights) { f.t += dt; }
    for (const f of flights) if (f.t >= f.dur) { hidden[f.key] = Math.max(0, (hidden[f.key] || 0) - 1); }
    flights = flights.filter((f) => f.t < f.dur);
  }
  function fly(from, key, i, n, p, delay) {
    const to = slotXY(key.replace(/^(p\d+|bar\d|off\d)$/, "$1"), i, n);
    hidden[key] = (hidden[key] || 0) + 1;
    flights.push({ x0: from.x, y0: from.y, x1: to.x, y1: to.y, key, p, t: -(delay || 0), dur: 0.3, flat: to.flat });
  }

  // ---------- drawing helpers ----------
  const rng = (function () { let a = 1234567; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
  function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
  function buildBoard() {
    boardLayer = document.createElement("canvas"); boardLayer.width = c.width; boardLayer.height = c.height;
    const g = boardLayer.getContext("2d"); g.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    // room background
    let bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#22160d"); bg.addColorStop(1, "#0f0906");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const vg = g.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 640); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.55)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    // wood frame
    g.save(); g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 18; g.shadowOffsetY = 6;
    let wd = g.createLinearGradient(BX, BY, BX + BW, BY + BH); wd.addColorStop(0, "#8b5a32"); wd.addColorStop(0.5, "#5f3819"); wd.addColorStop(1, "#7f4f29");
    g.fillStyle = wd; rr(g, BX, BY, BW, BH, 16); g.fill(); g.restore();
    g.save(); rr(g, BX, BY, BW, BH, 16); g.clip();
    for (let i = 0; i < 160; i++) {
      const y = BY + rng() * BH, x = BX + rng() * BW, len = 60 + rng() * 240;
      g.strokeStyle = rng() < 0.5 ? "rgba(30,12,2,.16)" : "rgba(255,210,150,.07)"; g.lineWidth = 0.6 + rng() * 1.6;
      g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + len / 3, y + rng() * 5 - 2.5, x + (2 * len) / 3, y + rng() * 5 - 2.5, x + len, y + rng() * 4 - 2); g.stroke();
    }
    g.restore();
    g.strokeStyle = "rgba(255,225,170,.35)"; g.lineWidth = 1.5; rr(g, BX + 1, BY + 1, BW - 2, BH - 2, 15); g.stroke();
    g.strokeStyle = "rgba(0,0,0,.5)"; g.lineWidth = 1; rr(g, BX + 6, BY + 6, BW - 12, BH - 12, 11); g.stroke();
    // leather playfield halves
    for (const [x0, x1] of [[LX0 - 4, SPINE0], [SPINE1, RX0 + 4]]) {
      const px = x0, py = Y0 - 4, pw = x1 - x0, ph = QH * 2 + BAND + 8;
      g.save(); rr(g, px, py, pw, ph, 6); g.clip();
      let lg = g.createLinearGradient(0, py, 0, py + ph); lg.addColorStop(0, "#33231a"); lg.addColorStop(0.5, "#2a1d15"); lg.addColorStop(1, "#33231a");
      g.fillStyle = lg; g.fillRect(px, py, pw, ph);
      for (let i = 0; i < 900; i++) { g.fillStyle = rng() < 0.5 ? "rgba(255,230,190,.045)" : "rgba(0,0,0,.09)"; g.fillRect(px + rng() * pw, py + rng() * ph, 1.4, 1.4); }
      g.restore();
      g.strokeStyle = "rgba(0,0,0,.65)"; g.lineWidth = 2; rr(g, px, py, pw, ph, 6); g.stroke();
      g.strokeStyle = "rgba(215,175,110,.32)"; g.lineWidth = 1; g.setLineDash([4, 4]); rr(g, px + 3, py + 3, pw - 6, ph - 6, 4); g.stroke(); g.setLineDash([]);
    }
    // triangles
    for (let i = 0; i < 24; i++) {
      const top = isTop(i), c = colOf(i), x = colX(c);
      const by = top ? Y0 : Y0 + 2 * QH + BAND, ty = top ? Y0 + QH : Y0 + QH + BAND;
      const light = (c + (top ? 0 : 1)) % 2 === 0;
      const tg = g.createLinearGradient(0, by, 0, ty);
      if (light) { tg.addColorStop(0, "#f0dcae"); tg.addColorStop(1, "#c9ae76"); } else { tg.addColorStop(0, "#a2432f"); tg.addColorStop(1, "#6b2418"); }
      g.fillStyle = tg; g.beginPath(); g.moveTo(x + 1.5, by); g.lineTo(x + PW / 2, ty); g.lineTo(x + PW - 1.5, by); g.closePath(); g.fill();
      g.strokeStyle = "rgba(0,0,0,.28)"; g.lineWidth = 1; g.stroke();
    }
    // spine
    const sg = g.createLinearGradient(SPINE0, 0, SPINE1, 0); sg.addColorStop(0, "#5a3618"); sg.addColorStop(0.5, "#8a5a30"); sg.addColorStop(1, "#5a3618");
    g.fillStyle = sg; g.fillRect(SPINE0, BY + 4, SPINE1 - SPINE0, BH - 8);
    g.strokeStyle = "rgba(0,0,0,.45)"; g.lineWidth = 1; g.strokeRect(SPINE0 + 0.5, BY + 4.5, SPINE1 - SPINE0 - 1, BH - 9);
    g.fillStyle = "rgba(255,220,160,.25)"; g.fillRect(SPINE0 + 2, BY + 4, 2, BH - 8);
  }
  function triPath(g, i) {
    const top = isTop(i), x = colX(colOf(i)), by = top ? Y0 : Y0 + 2 * QH + BAND, ty = top ? Y0 + QH : Y0 + QH + BAND;
    g.beginPath(); g.moveTo(x + 1.5, by); g.lineTo(x + PW / 2, ty); g.lineTo(x + PW - 1.5, by); g.closePath();
  }
  function checker(g, x, y, r, p, o) {
    o = o || {};
    g.save(); g.globalAlpha = o.alpha == null ? 1 : o.alpha;
    g.fillStyle = "rgba(0,0,0,.38)"; g.beginPath(); g.ellipse(x + 1.5, y + 3, r, r * 0.92, 0, 0, 7); g.fill();
    const base = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    if (p === 0) { base.addColorStop(0, "#fffdf6"); base.addColorStop(0.55, "#eadfc4"); base.addColorStop(1, "#a8946a"); }
    else { base.addColorStop(0, "#6b6b78"); base.addColorStop(0.5, "#2b2b34"); base.addColorStop(1, "#050508"); }
    if (o.glow) { g.shadowColor = o.glow; g.shadowBlur = 14; }
    g.fillStyle = base; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.shadowBlur = 0;
    g.strokeStyle = p === 0 ? "rgba(90,70,40,.8)" : "rgba(0,0,0,.9)"; g.lineWidth = 1.2; g.stroke();
    g.strokeStyle = p === 0 ? "rgba(120,95,55,.35)" : "rgba(255,255,255,.16)"; g.lineWidth = 1.3; g.beginPath(); g.arc(x, y, r * 0.68, 0, 7); g.stroke();
    const dish = g.createRadialGradient(x + r * 0.2, y + r * 0.25, 1, x, y, r * 0.66);
    dish.addColorStop(0, "rgba(255,255,255,0)"); dish.addColorStop(1, p === 0 ? "rgba(120,95,55,.18)" : "rgba(0,0,0,.35)");
    g.fillStyle = dish; g.beginPath(); g.arc(x, y, r * 0.66, 0, 7); g.fill();
    const gl = g.createLinearGradient(x - r * 0.6, y - r * 0.8, x + r * 0.1, y - r * 0.1);
    gl.addColorStop(0, p === 0 ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.55)"); gl.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gl; g.beginPath(); g.ellipse(x - r * 0.28, y - r * 0.42, r * 0.5, r * 0.28, -0.6, 0, 7); g.fill();
    g.restore();
  }
  function flatChecker(g, x, y, p) { // edge-on checker for off trays
    const gr = g.createLinearGradient(x - 5, 0, x + 5, 0);
    if (p === 0) { gr.addColorStop(0, "#c9b78e"); gr.addColorStop(0.4, "#fff8e8"); gr.addColorStop(1, "#b7a37a"); } else { gr.addColorStop(0, "#111"); gr.addColorStop(0.4, "#5c5c68"); gr.addColorStop(1, "#0a0a0d"); }
    g.fillStyle = gr; rr(g, x - 4.5, y - 15, 9, 30, 3); g.fill();
    g.strokeStyle = "rgba(0,0,0,.55)"; g.lineWidth = 1; g.stroke();
  }
  const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
  function die(g, x, y, s, v, p, alpha, rot) {
    g.save(); g.translate(x, y); g.rotate(rot || 0); g.globalAlpha = alpha == null ? 1 : alpha;
    g.fillStyle = "rgba(0,0,0,.4)"; rr(g, -s / 2 + 2, -s / 2 + 4, s, s, s * 0.2); g.fill();
    const gr = g.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
    if (p === 0) { gr.addColorStop(0, "#fffdf4"); gr.addColorStop(1, "#d8ccae"); } else { gr.addColorStop(0, "#4a4a55"); gr.addColorStop(1, "#15151a"); }
    g.fillStyle = gr; rr(g, -s / 2, -s / 2, s, s, s * 0.2); g.fill();
    g.strokeStyle = p === 0 ? "rgba(90,70,40,.7)" : "rgba(0,0,0,.9)"; g.lineWidth = 1.2; g.stroke();
    g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 1; rr(g, -s / 2 + 1.5, -s / 2 + 1.5, s - 3, s - 3, s * 0.17); g.stroke();
    g.fillStyle = p === 0 ? "#2a1a10" : "#f3e7c9";
    for (const [px, py] of PIPS[v]) { g.beginPath(); g.arc(px * s * 0.25, py * s * 0.25, s * 0.09, 0, 7); g.fill(); }
    g.restore();
  }
  function btn(id, x, y, w, h, label, fn, o) {
    o = o || {}; const en = o.enabled !== false;
    ui.push({ id, x, y, w, h, fn, enabled: en });
    ctx.save(); ctx.globalAlpha = en ? 1 : 0.45;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    if (o.primary) { g.addColorStop(0, "#f6d67e"); g.addColorStop(1, "#c08a2c"); } else if (o.on) { g.addColorStop(0, "#8a6a3a"); g.addColorStop(1, "#5e4322"); } else { g.addColorStop(0, "#4b3220"); g.addColorStop(1, "#2e1d11"); }
    ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    ctx.fillStyle = g; rr(ctx, x, y, w, h, o.r || 12); ctx.fill(); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = o.primary ? "#fff0b8" : o.on ? "#e8c47a" : "rgba(230,190,120,.35)"; ctx.lineWidth = o.on ? 2 : 1.2; ctx.stroke();
    ctx.fillStyle = o.primary ? "#2b1a08" : "#f6e6c4"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "800 " + (o.font || 17) + "px system-ui";
    const lines = String(label).split("\n");
    lines.forEach((ln, i) => ctx.fillText(ln, x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * ((o.font || 17) + 2)));
    ctx.restore();
  }
  function text(s, x, y, size, color, align, weight) {
    ctx.fillStyle = color; ctx.font = (weight || 700) + " " + size + "px system-ui"; ctx.textAlign = align || "left"; ctx.textBaseline = "middle"; ctx.fillText(s, x, y);
  }

  // ---------- main draw ----------
  function stackCount(key, actual) { return Math.max(0, actual - (hidden[key] || 0)); }
  function draw() {
    ui = [];
    if (!boardLayer) buildBoard();
    ctx.drawImage(boardLayer, 0, 0, W, H);
    if (!G) G = { score: [0, 0], cube: { v: 1, owner: -1 }, s: E.newState(), turn: 0, dice: [], rem: [], played: [], undo: [], last: null };
    const s = G.s, viewer = isCpu() ? 0 : phase === "title" ? 0 : G.turn;
    const moving = phase === "move" && isHuman(G.turn) && !G.queue;
    const mv = moving ? movableFrom() : new Set();

    // last move highlight
    if (G.last && phase !== "title") {
      ctx.save();
      for (const m of G.last.moves) {
        if (m.f !== E.BAR) { triPath(ctx, m.f); ctx.fillStyle = "rgba(255,225,120,.16)"; ctx.fill(); ctx.strokeStyle = "rgba(255,225,120,.5)"; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]); }
        if (m.t !== E.OFF) { triPath(ctx, m.t); ctx.fillStyle = "rgba(255,215,90,.34)"; ctx.fill(); ctx.strokeStyle = "rgba(255,225,120,.9)"; ctx.lineWidth = 2; ctx.stroke(); }
      }
      ctx.restore();
    }
    // selection highlights on triangles
    if (sel) {
      for (const [k, path] of sel.dests) {
        if (k === "off") continue;
        triPath(ctx, k); const hit = path[path.length - 1].hit;
        ctx.fillStyle = hit ? "rgba(255,90,70,.30)" : "rgba(110,255,150,.30)"; ctx.fill();
      }
    }
    // point numbers
    ctx.font = "800 9px system-ui"; ctx.textBaseline = "middle"; ctx.textAlign = "center";
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = "rgba(255,232,190,.7)";
      ctx.fillText(String(E.pointNo(viewer, i)), ptX(i), isTop(i) ? Y0 - 6 : Y0 + 2 * QH + BAND + 6);
    }
    // checkers on points
    const glowT = 0.5 + 0.5 * Math.sin(t * 5);
    for (let i = 0; i < 24; i++) {
      const total = Math.abs(s.pts[i]); if (!total) continue;
      const p = s.pts[i] > 0 ? 0 : 1, n = stackCount("p" + i, total), key = "p" + i;
      for (let k = 0; k < n; k++) {
        const pos = slotXY(key, k, total);
        const top = k === n - 1, isSel = sel && sel.from === i && top;
        checker(ctx, pos.x, pos.y - (isSel ? 3 : 0), R, p, { glow: isSel ? "#ffe27a" : top && mv.has(i) && !sel ? "rgba(255,226,122," + (0.4 + 0.5 * glowT) + ")" : null });
      }
      if (total > 6) { const pos = slotXY(key, n - 1, total); text(String(total), pos.x, pos.y + 1, 13, p === 0 ? "#2a1a10" : "#f3e7c9", "center", 900); }
    }
    // bar
    for (let p = 0; p < 2; p++) {
      const total = s.bar[p], n = stackCount("bar" + p, total);
      for (let k = 0; k < n; k++) { const pos = slotXY("bar" + p, k, total); const isSel = sel && sel.from === E.BAR && G.turn === p && k === n - 1; checker(ctx, pos.x, pos.y, R, p, { glow: isSel ? "#ffe27a" : mv.has(E.BAR) && G.turn === p && !sel && k === n - 1 ? "rgba(255,226,122," + (0.4 + 0.5 * glowT) + ")" : null }); }
    }
    // destinations
    if (sel) {
      for (const [k, path] of sel.dests) {
        if (k === "off") continue;
        const cnt = Math.abs(s.pts[k]), own = s.pts[k] * (G.turn === 0 ? 1 : -1) > 0;
        const pos = slotXY("p" + k, own ? cnt : cnt === 1 ? 0 : 0, own ? cnt + 1 : cnt);
        const hit = path[path.length - 1].hit;
        const pulse = 1 + 0.08 * Math.sin(t * 8);
        ctx.save(); ctx.globalAlpha = 0.9;
        ctx.strokeStyle = hit ? "#ff6a5a" : "#7dff9b"; ctx.fillStyle = hit ? "rgba(255,90,70,.28)" : "rgba(110,255,150,.25)"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(pos.x, pos.y, (R - 2) * pulse, 0, 7); ctx.fill(); ctx.stroke();
        if (path.length > 1) { ctx.fillStyle = "#fff"; ctx.font = "800 11px system-ui"; ctx.textAlign = "center"; ctx.fillText(String(path.reduce((a, m) => a + m.d, 0)), pos.x, pos.y + 1); }
        ctx.restore();
      }
    }
    // hint arrow marker
    if (hint && sel && sel.hint) {
      const dst = hint.t;
      if (dst !== E.OFF) { const pos = slotXY("p" + dst, 0, 1); ctx.strokeStyle = "#ffd75e"; ctx.lineWidth = 3; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.arc(pos.x + (colOf(dst) ? -0 : 0), pos.y, R + 3, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    }
    // flights
    for (const f of flights) {
      if (f.t < 0) continue;
      const u = ease(Math.min(1, f.t / f.dur));
      const x = f.x0 + (f.x1 - f.x0) * u, y = f.y0 + (f.y1 - f.y0) * u - Math.sin(u * Math.PI) * 16;
      if (f.flat) { flatChecker(ctx, x, y, f.p); } else checker(ctx, x, y, R * (1 + 0.1 * Math.sin(u * Math.PI)), f.p);
    }
    // drag ghost
    if (press && press.drag) checker(ctx, pointerXY.x, pointerXY.y - 22, R * 1.1, G.turn, { glow: "#ffe27a" });

    drawStrips();
    drawDiceArea();
    drawHeader();
    drawButtons();
    if (toast) {
      const a = Math.min(1, toast.life * 3, (toast.max - toast.life) * 6 + 0.2);
      ctx.save(); ctx.globalAlpha = a; ctx.font = "900 20px system-ui";
      const tw = ctx.measureText(toast.text).width + 36, ty = BANDY - 34 - (1 - a) * 6;
      ctx.fillStyle = "rgba(20,10,4,.88)"; rr(ctx, W / 2 - tw / 2, ty - 18, tw, 36, 18); ctx.fill();
      ctx.strokeStyle = "#e8c47a"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = "#ffe9b0"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(toast.text, W / 2, ty + 1); ctx.restore();
    }
    if (phase === "offer") drawOffer();
    if (phase === "gameEnd" || phase === "matchEnd") drawResult();
    if (phase === "title") drawTitle();
  }

  function drawStrips() {
    const s = G.s;
    for (let p = 0; p < 2; p++) {
      const y = stripY(p), active = phase !== "title" && G.turn === p && phase !== "gameEnd" && phase !== "matchEnd" && phase !== "opening";
      const g = ctx.createLinearGradient(0, y, 0, y + STRIP_H); g.addColorStop(0, active ? "rgba(90,58,28,.95)" : "rgba(50,32,18,.9)"); g.addColorStop(1, active ? "rgba(60,38,18,.95)" : "rgba(34,21,12,.9)");
      ctx.fillStyle = g; rr(ctx, BX, y, BW, STRIP_H, 12); ctx.fill();
      ctx.strokeStyle = active ? "#e8c47a" : "rgba(215,175,110,.25)"; ctx.lineWidth = active ? 1.8 : 1; ctx.stroke();
      checker(ctx, BX + 26, y + STRIP_H / 2, 13, p);
      text(longName(p), BX + 48, y + 16, 14, active ? "#ffe9b0" : "#dcc9a3", "left", 800);
      text(E.pips(s, p) + " pips  ·  " + G.score[p] + "/" + cfg.target, BX + 48, y + 34, 12, "rgba(230,205,160,.85)", "left", 700);
      // off tray
      const canOff = sel && sel.dests.has("off") && G.turn === p;
      ctx.fillStyle = "rgba(0,0,0,.42)"; rr(ctx, TRAY_X, y + 5, TRAY_W, STRIP_H - 10, 8); ctx.fill();
      ctx.strokeStyle = canOff ? "#7dff9b" : "rgba(215,175,110,.25)"; ctx.lineWidth = canOff ? 2.5 + Math.sin(t * 8) : 1; ctx.stroke();
      if (canOff) { ctx.fillStyle = "rgba(110,255,150,.12)"; ctx.fill(); }
      const total = s.off[p], n = stackCount("off" + p, total);
      if (!n && !canOff) text("OFF", TRAY_X + TRAY_W / 2, y + STRIP_H / 2, 11, "rgba(230,200,150,.3)", "center", 800);
      if (canOff && !n) text("BEAR OFF", TRAY_X + TRAY_W / 2, y + STRIP_H / 2, 13, "#9dffb4", "center", 900);
      for (let k = 0; k < n; k++) { const pos = slotXY("off" + p, k, total); flatChecker(ctx, pos.x, pos.y, p); }
    }
  }
  function drawDiceArea() {
    const cx = (SPINE1 + RX0) / 2, cy = BANDY + BAND / 2;
    if (diceAnim) {
      const a = diceAnim, u = Math.min(1, a.t / a.dur), n = 2, size = 42;
      const who = a.opening ? null : G.turn;
      for (let i = 0; i < n; i++) {
        const settle = u > 0.82;
        const v = settle ? a.vals[i] : 1 + Math.floor((t * 22 + i * 3.7) % 6);
        const jx = settle ? 0 : Math.sin(t * 40 + i) * 5 * (1 - u), jy = settle ? 0 : Math.cos(t * 33 + i * 2) * 8 * (1 - u);
        const x = cx + (i ? 1 : -1) * 32 + jx, y = cy + jy - (settle ? 0 : Math.abs(Math.sin(u * 9 + i)) * 10 * (1 - u));
        die(ctx, x, y, size, v, a.opening ? i : who, 1, settle ? 0 : Math.sin(t * 25 + i * 2) * 0.5 * (1 - u));
      }
      return;
    }
    if (G.dice && G.dice.length && phase !== "roll") {
      const list = E.turnDice(G.dice), pool = (G.rem || []).slice(), dbl = list.length === 4, size = dbl ? 31 : 42, gap = dbl ? 6 : 14;
      const totalW = list.length * size + (list.length - 1) * gap, x0 = cx - totalW / 2 + size / 2;
      const p = G.openDice ? null : G.turn;
      list.forEach((v, i) => {
        const k = pool.indexOf(v), used = k < 0; if (!used) pool.splice(k, 1);
        die(ctx, x0 + i * (size + gap), cy, size, v, G.openDice ? (G.dice[0] > G.dice[1] ? (i === 0 ? 0 : 1) : (i === 0 ? 0 : 1)) : p, used ? 0.35 : 1, used ? 0 : (i % 2 ? 0.05 : -0.05));
      });
    } else if (phase === "roll" && isHuman(G.turn)) {
      const pulse = 0.7 + 0.3 * Math.sin(t * 4);
      ctx.globalAlpha = pulse; text("TAP TO ROLL", cx, cy, 16, "#ffe9b0", "center", 900); ctx.globalAlpha = 1;
    }
  }
  function drawHeader() {
    btn("menu", 10, 10, 64, 40, "Menu", () => { tok++; timers = []; phase = "title"; sel = null; diceAnim = null; flights = []; hidden = {}; }, { font: 14 });
    let line1;
    if (isCpu()) line1 = "You " + G.score[0] + "  –  " + G.score[1] + " CPU"; else line1 = "White " + G.score[0] + "  –  " + G.score[1] + " Black";
    text(line1, W / 2, 20, 18, "#ffe9b0", "center", 900);
    const st = phase === "title" ? "" : G.status || "";
    text(st, W / 2, 44, 13, "rgba(240,220,180,.9)", "center", 700);
    if (cfg.cubeOn && cfg.target > 1) {
      const x = 350, y = 5, sz = 40, cb = G.cube, can = canDouble(0) && isHuman(0) || (canDouble(1) && isHuman(1));
      const cp = cb.owner === -1 ? null : cb.owner;
      ctx.save();
      const g = ctx.createLinearGradient(x, y, x + sz, y + sz); g.addColorStop(0, "#fff8e4"); g.addColorStop(1, "#d6c69c");
      ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2; ctx.fillStyle = g; rr(ctx, x, y, sz, sz, 8); ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = can ? "#ffcf4a" : "#8a7752"; ctx.lineWidth = can ? 3 : 1.5; ctx.stroke();
      ctx.fillStyle = "#2b1a08"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "900 " + (cb.v > 9 ? 20 : 26) + "px system-ui"; ctx.fillText(String(cb.owner === -1 && cb.v === 1 ? 64 : cb.v), x + sz / 2, y + sz / 2 + 1);
      ctx.restore();
      text(cp === null ? "cube: centre" : "cube: " + nameOf(cp).toLowerCase(), x + sz / 2 - 6, y + sz + 8, 10, "rgba(230,205,160,.75)", "center", 700);
    }
  }
  function drawButtons() {
    const y = BTN_Y, hum = isHuman(G.turn);
    btn("undo", BX, y, 112, BTN_H, "Undo", undo, { enabled: phase === "move" && !G.queue && G.undo.length > 0 && hum });
    let label = "…", fn = () => {}, en = false, primary = false;
    if (phase === "roll" && hum) { label = "ROLL DICE"; fn = rollDice; en = true; primary = true; }
    else if (phase === "move" && hum) { if (G.pend) { label = "END TURN"; fn = endTurn; en = true; primary = true; } else { const left = G.maxLen - G.played.length; label = left + (left === 1 ? " move left" : " moves left"); } }
    else if (phase === "rolling" || phase === "opening") label = "Rolling…";
    else if (phase === "noMoves") label = "No legal moves";
    else if (phase === "cpu" || (phase === "roll" && !hum)) label = "Computer…";
    else if (phase === "offer") label = "Your decision";
    btn("main", BX + 122, y, 164, BTN_H, label, fn, { enabled: en, primary, font: 18 });
    const dbl = canDouble(G.turn) && hum;
    if (dbl) btn("dbl", BX + 296, y, 112, BTN_H, "Double\n×" + G.cube.v * 2, () => offerDouble(G.turn), { font: 16 });
    else btn("hint", BX + 296, y, 112, BTN_H, "Hint", showHint, { enabled: phase === "move" && !G.queue && hum && !G.pend });
  }
  function overlay(a) { ctx.fillStyle = "rgba(8,4,2," + a + ")"; ctx.fillRect(0, 0, W, H); }
  function card(x, y, w, h) {
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, "#5b3a1f"); g.addColorStop(1, "#33200f");
    ctx.fillStyle = g; rr(ctx, x, y, w, h, 20); ctx.fill(); ctx.restore();
    ctx.strokeStyle = "rgba(240,200,130,.55)"; ctx.lineWidth = 1.5; rr(ctx, x, y, w, h, 20); ctx.stroke();
  }
  function drawOffer() {
    overlay(0.55); ui = ui.filter((b) => false);
    const o = G.offer, x = 30, y = 300, w = W - 60, h = 250;
    card(x, y, w, h);
    text("Doubling cube", W / 2, y + 36, 22, "#ffe9b0", "center", 900);
    text(nameOf(o.from) + (o.from === 1 && isCpu() ? " doubles the stakes to " : " doubles the stakes to ") + o.nv, W / 2, y + 74, 15, "#f0dcb5", "center", 700);
    text("Take: play on for " + o.nv + " points.", W / 2, y + 104, 13, "rgba(240,220,180,.85)", "center", 600);
    text("Drop: concede and lose " + G.cube.v + (G.cube.v === 1 ? " point." : " points."), W / 2, y + 124, 13, "rgba(240,220,180,.85)", "center", 600);
    if (!isCpu()) text(nameOf(o.to) + ", choose:", W / 2, y + 150, 13, "#ffe9b0", "center", 800);
    btn("take", x + 20, y + 168, (w - 60) / 2, 56, "Take", () => { phase = "roll"; resolveDouble(o.from, true); }, { primary: true, font: 20 });
    btn("drop", x + 40 + (w - 60) / 2, y + 168, (w - 60) / 2, 56, "Drop", () => { phase = "roll"; resolveDouble(o.from, false); }, { font: 20 });
  }
  function drawResult() {
    overlay(0.6); ui = ui.filter((b) => false);
    const r = G.result, match = phase === "matchEnd", x = 24, y = match ? 220 : 250, w = W - 48, h = match ? 440 : 330;
    card(x, y, w, h);
    const winName = isCpu() ? (r.winner === 0 ? "You win" : "Computer wins") : nameOf(r.winner) + " wins";
    text(match ? (isCpu() ? (r.winner === 0 ? "Match won!" : "Match lost") : nameOf(r.winner) + " wins the match!") : winName + " the game", W / 2, y + 42, 26, "#ffe9b0", "center", 900);
    checker(ctx, W / 2, y + 100, 26, r.winner);
    const kind = r.why === "drop" ? "Opponent dropped the double" : r.kind === "backgammon" ? "Backgammon! (×3)" : r.kind === "gammon" ? "Gammon! (×2)" : "Single game";
    text(kind, W / 2, y + 152, 17, "#ffd57a", "center", 800);
    text("+" + r.pts + (r.pts === 1 ? " point" : " points") + (r.cube > 1 ? "  (cube ×" + r.cube + ")" : ""), W / 2, y + 180, 16, "#f0dcb5", "center", 700);
    text((isCpu() ? "You " : "White ") + G.score[0] + "  –  " + G.score[1] + (isCpu() ? " Computer" : " Black") + "   (to " + cfg.target + ")", W / 2, y + 214, 15, "#ffe9b0", "center", 800);
    if (match && isCpu()) {
      text("Score submitted: " + G.finalScore, W / 2, y + 246, 14, "#9dffb4", "center", 800);
      text("Record vs computer: " + stats.wins + " W – " + stats.losses + " L", W / 2, y + 268, 12, "rgba(240,220,180,.75)", "center", 600);
    }
    if (match) {
      btn("again", x + 24, y + h - 130, w - 48, 54, "Play again", () => newMatch(), { primary: true, font: 19 });
      btn("tomenu", x + 24, y + h - 66, w - 48, 48, "Menu", () => { phase = "title"; }, { font: 16 });
    } else btn("next", x + 24, y + h - 84, w - 48, 60, "Next game", () => { newGame(); }, { primary: true, font: 20 });
  }
  function chip(id, x, y, w, label, on, fn, en) { btn(id, x, y, w, 46, label, fn, { on, font: 15, r: 10, enabled: en !== false }); }
  function drawTitle() {
    overlay(0.95); ui = [];
    text("BACKGAMMON", W / 2, 84, 40, "#ffe9b0", "center", 900);
    text("CLUB", W / 2, 122, 22, "#d9b26a", "center", 900);
    checker(ctx, W / 2 - 34, 168, 20, 0); checker(ctx, W / 2 + 34, 168, 20, 1);
    die(ctx, W / 2, 170, 30, 5, 0, 1, 0.2);
    let y = 236;
    text("OPPONENT", 40, y, 12, "#c9a86c", "left", 800);
    chip("m-cpu", 40, y + 14, 156, "vs Computer", cfg.mode === "cpu", () => { cfg.mode = "cpu"; store.set("cfg", cfg); });
    chip("m-two", 210, y + 14, 170, "2 Players", cfg.mode === "two", () => { cfg.mode = "two"; store.set("cfg", cfg); });
    y += 78;
    text(cfg.mode === "cpu" ? "DIFFICULTY" : "DIFFICULTY (vs computer only)", 40, y, 12, "#c9a86c", "left", 800);
    ["easy", "medium", "hard"].forEach((l, i) => chip("l-" + l, 40 + i * 114, y + 14, 106, cap(l), cfg.level === l && cfg.mode === "cpu", () => { cfg.level = l; store.set("cfg", cfg); }, cfg.mode === "cpu"));
    y += 78;
    text("MATCH LENGTH", 40, y, 12, "#c9a86c", "left", 800);
    [1, 3, 5].forEach((n, i) => chip("t-" + n, 40 + i * 114, y + 14, 106, n + (n === 1 ? " point" : " points"), cfg.target === n, () => { cfg.target = n; store.set("cfg", cfg); }));
    y += 78;
    text("DOUBLING CUBE", 40, y, 12, "#c9a86c", "left", 800);
    chip("c-on", 40, y + 14, 156, "On", cfg.cubeOn && cfg.target > 1, () => { cfg.cubeOn = true; store.set("cfg", cfg); }, cfg.target > 1);
    chip("c-off", 210, y + 14, 170, "Off", !cfg.cubeOn || cfg.target === 1, () => { cfg.cubeOn = false; store.set("cfg", cfg); });
    if (cfg.target === 1) text("(no cube in a 1-point match)", 40, y + 76, 11, "rgba(230,200,150,.6)", "left", 600);
    y += 92;
    btn("start", 40, y, W - 80, 62, "PLAY", () => { store.set("cfg", cfg); newMatch(); }, { primary: true, font: 26 });
    text("Gammon = 2 pts · Backgammon = 3 pts", W / 2, y + 90, 12, "rgba(230,205,160,.75)", "center", 700);
    if (stats.matches) text("Record vs computer: " + stats.wins + " W – " + stats.losses + " L", W / 2, y + 112, 12, "rgba(230,205,160,.6)", "center", 600);
  }

  let last = performance.now(), speed = 1;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!paused) { if (speed > 1) for (let i = 0; i < speed; i++) update(dt); else update(dt); }
    draw();
    requestAnimationFrame(loop);
  }
  // Debug/test hook (harmless in production)
  window.__bg = { force(st, turn, dice) { tok++; timers = []; flights = []; hidden = {}; G.s = st; G.turn = turn; G.dice = dice; G.openDice = false; G.played = []; G.undo = []; G.queue = false; beginMoves(); }, offerDouble, endGame, get G() { return G; }, get phase() { return phase; }, get sel() { return sel; }, get ui() { return ui; }, cfg, slotXY, hitTest, ptXY: (i) => slotXY("p" + i, 0, 1), BANDY, BTN_Y, BOT_Y, TOP_Y, H, W, set paused(v) { paused = v; }, set speed(v) { speed = v; } };
  requestAnimationFrame(loop);
})();
