// Phase Runner - a pseudo-3D two-reality endless runner for Arcadia.
(() => {
  "use strict";
  const W = 540, H = 960;
  const HZ = 350, GY = 800, D0 = 300, LW = 150, RH = 240, ZFAR = 3400, ROWSP = 300;
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const c = document.getElementById("c");
  const ctx = c.getContext("2d");
  let DPR = 1;
  let bufR = null, bufC = null;

  function fit() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    const s = Math.min(innerWidth / W, innerHeight / H) || 1;
    c.style.width = W * s + "px"; c.style.height = H * s + "px";
    c.width = Math.max(2, Math.round(W * s * DPR)); c.height = Math.max(2, Math.round(H * s * DPR));
    ctx.setTransform(c.width / W, 0, 0, c.height / H, 0, 0);
    bufR = bufC = null;
  }
  addEventListener("resize", fit); fit();

  // ---------- helpers ----------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const S = (z) => D0 / (z + D0);
  const Y = (z) => HZ + (GY - HZ) * S(z);
  let camX = 0;
  const X = (wx, z) => W / 2 + (wx - camX) * S(z);
  function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function rr(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function txt(s, x, y, size, color, align, weight, glow) {
    ctx.font = (weight || 800) + " " + size + "px " + FONT;
    ctx.textAlign = align || "center"; ctx.textBaseline = "middle";
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 14; }
    ctx.fillStyle = color; ctx.fillText(s, x, y);
    if (glow) ctx.shadowBlur = 0;
  }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, String(v)); } catch (e) {} return null; }

  // ---------- palette (day = 0, night = 1) ----------
  const PAL = {
    skyTop: ["#ff5f6d", "#04021a"], skyMid: ["#ff9966", "#180b4d"], skyHor: ["#ffe29a", "#3b23a8"],
    gnd: ["#3a1250", "#070420"], road: ["#2b1238", "#0b0831"], roadFar: ["#6a2a58", "#221570"],
    edge: ["#ffc15e", "#2ff0ff"], edge2: ["#ff5a5f", "#b44dff"], grid: ["#ff8a5c", "#7a4dff"],
    bFar: ["#d1507f", "#1d1260"], bMid: ["#a03a6a", "#150e4a"], bNear: ["#6e2559", "#0d0833"],
    face: ["#8f3565", "#160f4d"], side: ["#55194a", "#0a0628"], accent: ["#ffb020", "#29f0ff"], accent2: ["#ff4d6d", "#c04dff"]
  };
  const PA = {}; for (const k in PAL) PA[k] = [hex(PAL[k][0]), hex(PAL[k][1])];
  let CC = {}, CR = {};
  function setPalette(t) {
    for (const k in PA) {
      const a = PA[k][0], b = PA[k][1];
      const r = Math.round(lerp(a[0], b[0], t)), g = Math.round(lerp(a[1], b[1], t)), bl = Math.round(lerp(a[2], b[2], t));
      CR[k] = [r, g, bl]; CC[k] = "rgb(" + r + "," + g + "," + bl + ")";
    }
  }
  const RA = (k, a) => "rgba(" + CR[k][0] + "," + CR[k][1] + "," + CR[k][2] + "," + a + ")";
  setPalette(0);

  const glowCache = {};
  function glow(color) {
    if (glowCache[color]) return glowCache[color];
    const g = document.createElement("canvas"); g.width = g.height = 128;
    const x = g.getContext("2d"), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, color); gr.addColorStop(0.35, color.replace("1)", "0.4)")); gr.addColorStop(1, color.replace("1)", "0)"));
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    return (glowCache[color] = g);
  }
  function drawGlow(color, x, y, r, a) {
    ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = a == null ? 1 : a;
    ctx.drawImage(glow(color), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  }

  // ---------- state ----------
  let state = "title"; // title | tutorial | play | dying | over
  let paused = false, T = 0, tutSeen = store("phaserunner.tut") === "1";
  let best = Number(store("phaserunner.best") || 0);
  let muted = store("phaserunner.mute") === "1";
  let D = 0, runT = 0, speed = 600, coins = 0, coinPts = 0, streak = 0, phaseT = 0, phaseGot = false, phaseMult = 1;
  let magnetT = 0, shield = false, invulnT = 0, slowT = 0, firstRun = false, newBest = false, overT = 0, hitstop = 0;
  let rows = [], nextRowZ = 0, chunkCount = 0, lastChunk = -1, lastPowerChunk = 0, script = [];
  let wb = 0, shake = 0, swapFx = 0, hurtFx = 0, flash = 0, bank = 0, hint = "", hintT = 0;
  let demoSwapT = 2, demoLaneT = 0.5, demoLane = 1, lastScoreShown = 0, scorePop = 0;
  const pl = { lane: 1, x: 1, world: 0, vx: 0, bob: 0 };
  let parts = [], pops = [], rings = [], lines = [];

  function speedAt(t) { return 600 + 850 * (1 - Math.exp(-t / 50)); }
  const totalScore = () => Math.floor(D / 80) + coinPts;

  // ---------- audio ----------
  let AC = null, master = null, musicBus = null, musicFilt = null, noiseBuf = null;
  let mStep = 0, mNext = 0;
  function initAudio() {
    try {
      if (AC) { if (AC.state === "suspended") AC.resume(); return; }
      const Ctor = window.AudioContext || window.webkitAudioContext; if (!Ctor) return;
      AC = new Ctor();
      const comp = AC.createDynamicsCompressor(); comp.connect(AC.destination);
      master = AC.createGain(); master.gain.value = muted ? 0 : 0.6; master.connect(comp);
      musicFilt = AC.createBiquadFilter(); musicFilt.type = "lowpass"; musicFilt.frequency.value = 9000; musicFilt.Q.value = 2;
      musicBus = AC.createGain(); musicBus.gain.value = 0.5; musicBus.connect(musicFilt); musicFilt.connect(master);
      noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.5, AC.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      mNext = AC.currentTime + 0.1;
    } catch (e) { AC = null; }
  }
  function setMute(m) {
    muted = m; store("phaserunner.mute", m ? "1" : "0");
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.6, AC.currentTime, 0.02);
  }
  function osc(type, f0, f1, t, dur, vol, dest, filt) {
    const o = AC.createOscillator(), g = AC.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let n = o; if (filt) { const f = AC.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = filt; o.connect(f); n = f; }
    n.connect(g); g.connect(dest || master); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(t, dur, vol, ftype, f0, f1, dest) {
    const s = AC.createBufferSource(); s.buffer = noiseBuf; const f = AC.createBiquadFilter(); f.type = ftype;
    f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || master); s.start(t); s.stop(t + dur + 0.02);
  }
  const sfx = {
    coin(k) { if (!AC) return; const t = AC.currentTime, f = 880 * Math.pow(1.06, Math.min(k, 10)); osc("square", f, f, t, 0.07, 0.12, master, 5000); osc("square", f * 1.5, f * 1.5, t + 0.05, 0.11, 0.12, master, 5000); },
    swap(w) { if (!AC) return; const t = AC.currentTime; noise(t, 0.2, 0.35, "bandpass", w ? 3800 : 500, w ? 400 : 3800); osc("sine", w ? 900 : 260, w ? 240 : 900, t, 0.18, 0.3); },
    hit() { if (!AC) return; const t = AC.currentTime; noise(t, 0.5, 0.7, "lowpass", 3000, 80); osc("sine", 120, 28, t, 0.6, 0.7); osc("sawtooth", 300, 40, t, 0.5, 0.25, master, 1500); },
    power() { if (!AC) return; const t = AC.currentTime; [523, 659, 784, 1046].forEach((f, i) => osc("triangle", f, f, t + i * 0.06, 0.16, 0.2)); },
    shieldBreak() { if (!AC) return; const t = AC.currentTime; noise(t, 0.35, 0.5, "highpass", 2000, 6000); osc("triangle", 1200, 200, t, 0.3, 0.25); },
    over() { if (!AC) return; const t = AC.currentTime; [392, 330, 262, 196].forEach((f, i) => osc("sawtooth", f, f * 0.97, t + 0.15 + i * 0.16, 0.3, 0.16, master, 1400)); },
    start() { if (!AC) return; const t = AC.currentTime; osc("sawtooth", 130, 520, t, 0.35, 0.16, master, 2500); noise(t, 0.3, 0.2, "bandpass", 300, 4000); }
  };
  const ROOTS = [130.81, 110, 87.31, 98];
  function musicTick() {
    if (!AC || AC.state !== "running") return;
    const bpm = 112 + clamp((speed - 600) / 850, 0, 1) * 58 + (slowT > 0 ? -25 : 0);
    const sd = 60 / bpm / 4;
    if (mNext < AC.currentTime - 0.3) mNext = AC.currentTime + 0.05;
    const night = wb > 0.5;
    const target = state === "over" ? 700 : night ? 2400 : 9000;
    musicFilt.frequency.setTargetAtTime(target, AC.currentTime, 0.05);
    while (mNext < AC.currentTime + 0.12) {
      const t = mNext, s = mStep % 16, bar = Math.floor(mStep / 16) % 4, root = ROOTS[bar];
      const inten = state === "title" || state === "tutorial" ? 0.6 : 1;
      if (s % 4 === 0) { osc("sine", 150, 45, t, 0.16, 0.9 * inten, musicBus); }
      if (s === 4 || s === 12) noise(t, 0.12, 0.28 * inten, "bandpass", 1800, 1200, musicBus);
      if (s % 2 === 0) noise(t, 0.035, (s % 4 === 2 ? 0.2 : 0.09) * inten, "highpass", 7500, 0, musicBus);
      else if (speed > 900) noise(t, 0.02, 0.06 * inten, "highpass", 8500, 0, musicBus);
      if (s % 2 === 0 || s === 3 || s === 11) {
        const bn = [0, 0, 12, 0, 7, 0, 12, 10][(s >> 1) % 8] || 0;
        osc("sawtooth", root * Math.pow(2, bn / 12), 0, t, sd * 1.6, 0.34 * inten, musicBus, night ? 500 : 800);
      }
      const arp = night ? [0, 3, 7, 12, 15, 12, 7, 3] : [0, 4, 7, 12, 16, 12, 7, 4];
      if (state !== "over" && (state === "play" || state === "dying" || bar % 2 === 1 || s % 2 === 0)) {
        const nt = arp[s % 8] + (s >= 8 ? 12 : 0) * 0;
        osc(night ? "sawtooth" : "square", root * 4 * Math.pow(2, nt / 12), 0, t, sd * 0.9, night ? 0.08 : 0.07, musicBus, night ? 1800 : 3600);
      }
      mNext += sd; mStep++;
    }
  }

  // ---------- chunk generation ----------
  const CHUNKS = window.PR_CHUNKS, solve = window.PR_solve;
  const FLIPW = { a: "b", b: "a", g: "h", h: "g", e: "f", f: "e" };
  function cellItems(ch, lane) {
    switch (ch) {
      case "a": return { k: "blk", lane, world: 0 }; case "b": return { k: "blk", lane, world: 1 };
      case "g": return { k: "gap", lane, world: 0 }; case "h": return { k: "gap", lane, world: 1 };
      case "e": return { k: "drn", lane, world: 0 }; case "f": return { k: "drn", lane, world: 1 };
      case "c": return { k: "coin", lane, world: -1 };
    }
    return null;
  }
  function pushRow(str, coinLane) {
    const items = [];
    for (let l = 0; l < 3; l++) { const it = cellItems(str.charAt(l), l); if (it) items.push(it); }
    if (coinLane != null && !items.some((i) => i.lane === coinLane)) items.push({ k: "coin", lane: coinLane, world: -1 });
    items.forEach((i) => { i.lx = i.lane; i.taken = false; i.hit = false; });
    rows.push({ z: nextRowZ, items, str });
    nextRowZ += ROWSP;
  }
  function genChunk() {
    const lim = runT < 10 ? 0 : runT < 32 ? 1 : runT < 65 ? 2 : 3;
    let ch, guard = 0;
    if (script.length) ch = script.shift();
    else {
      const pool = []; CHUNKS.forEach((cc, i) => { if (cc.t <= lim && i !== lastChunk) { const w = 1 + cc.t * (lim > 0 ? 1.2 : 0) + (cc.t === lim ? 2 : 0); for (let k = 0; k < w; k++) pool.push(i); } });
      lastChunk = pool[(Math.random() * pool.length) | 0]; ch = CHUNKS[lastChunk];
    }
    let rs = ch.r.slice();
    if (!ch.fixed) {
      if (Math.random() < 0.5) rs = rs.map((s) => s.split("").reverse().join(""));
      if (Math.random() < 0.5) rs = rs.map((s) => s.split("").map((x) => FLIPW[x] || x).join(""));
    }
    const hasCoin = rs.some((s) => s.indexOf("c") >= 0);
    const path = hasCoin ? null : solve(rs, Math.random);
    // lead-in
    const lead = path ? path[0][0] : 1;
    pushRow("...", null); pushRow("...", chunkCount > 0 ? lead : null);
    rs.forEach((s, i) => pushRow(s, path && Math.random() < 0.7 ? path[i][0] : null));
    // power-up in the breathing room
    chunkCount++;
    if (chunkCount > 3 && chunkCount - lastPowerChunk >= 5 && Math.random() < 0.4 && !ch.fixed) {
      lastPowerChunk = chunkCount;
      const r = rows[rows.length - rs.length - 2], types = ["magnet", "shield", "slow"];
      const pt = types[(Math.random() * 3) | 0];
      r.items = r.items.filter((i) => i.k !== "coin");
      r.items.push({ k: "pow", pt, lane: (Math.random() * 3) | 0, lx: 0, world: -1, taken: false, hit: false });
      r.items[r.items.length - 1].lx = r.items[r.items.length - 1].lane;
    }
  }

  // ---------- run control ----------
  function resetRun() {
    D = 0; runT = 0; speed = 600; coins = 0; coinPts = 0; streak = 0; phaseT = 0; phaseGot = false; phaseMult = 1;
    magnetT = 0; shield = false; invulnT = 0; slowT = 0; newBest = false; hitstop = 0; hint = ""; hintT = 0;
    rows = []; nextRowZ = 900; chunkCount = 0; lastChunk = -1; lastPowerChunk = 0;
    pl.lane = 1; pl.x = 1; pl.world = 0; pl.vx = 0; wb = 0; parts = []; pops = []; rings = []; shake = 0; swapFx = 0; hurtFx = 0; flash = 0;
    firstRun = !tutSeen;
    script = firstRun ? [{ t: 0, fixed: true, r: ["aaa"] }, { t: 0, fixed: true, r: ["bbb"] }, { t: 0, fixed: true, r: [".a.", "...", "b.b"] }] : [];
    if (!firstRun) script = [{ t: 0, r: ["a..", "...", "..b", "...", ".a."] }];
    lastScoreShown = 0;
    while (nextRowZ < ZFAR + 600) genChunk();
    state = "play";
  }
  function endRun() {
    state = "dying"; overT = 0; hitstop = 0.14; shake = 26; hurtFx = 1; flash = 1; swapFx = 1;
    sfx.hit();
    const sc = totalScore();
    newBest = sc > best;
    if (newBest) { best = sc; store("phaserunner.best", best); }
    const px = X((pl.x - 1) * LW, 0), py = GY - 40;
    for (let i = 0; i < 70; i++) { const a = rnd(0, 6.283), v = rnd(80, 620); parts.push({ x: px, y: py, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 100, life: rnd(0.5, 1.2), max: 1.2, size: rnd(2, 6), col: i % 3 ? (pl.world ? "#29f0ff" : "#ffb020") : "#ffffff", g: 500 }); }
    if (window.Arcadia) { try { Arcadia.submitScore(sc); Arcadia.gameOver(); } catch (e) {} }
  }
  function toOver() { state = "over"; overT = 0; sfx.over(); }

  function doSwap() {
    if (state !== "play") return;
    pl.world ^= 1; swapFx = 1; phaseT = 1.0; phaseGot = false; sfx.swap(pl.world);
    rings.push({ t: 0, world: pl.world });
    shake = Math.max(shake, 7);
    for (let i = 0; i < 26; i++) { const a = rnd(0, 6.283), v = rnd(200, 520); parts.push({ x: X((pl.x - 1) * LW, 0), y: GY - 50, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.25, 0.5), max: 0.5, size: rnd(2, 5), col: pl.world ? "#29f0ff" : "#ffb020", g: 0 }); }
  }
  function doLane(d) {
    if (state !== "play") return;
    const n = clamp(pl.lane + d, 0, 2); if (n !== pl.lane) { pl.lane = n; bank += d * 0.5; }
  }
  function primary() {
    initAudio();
    if (state === "title") { if (!tutSeen) { state = "tutorial"; sfx.start(); } else { resetRun(); sfx.start(); } }
    else if (state === "tutorial") { resetRun(); tutSeen = true; store("phaserunner.tut", "1"); sfx.start(); }
    else if (state === "over" && overT > 0.7) { resetRun(); sfx.start(); }
    else doSwap();
  }

  // ---------- input ----------
  const MUTE = { x: W - 74, y: 22, w: 52, h: 52 };
  const ptrs = new Map();
  function lpos(e) { const r = c.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; }
  c.addEventListener("pointerdown", (e) => {
    e.preventDefault(); const p = lpos(e);
    try { c.setPointerCapture(e.pointerId); } catch (er) {}
    const ui = p.x > MUTE.x - 8 && p.y < MUTE.y + MUTE.h + 8 && p.x < W;
    ptrs.set(e.pointerId, { x: p.x, y: p.y, ax: p.x, ay: p.y, t: performance.now(), swiped: false, ui, moved: 0 });
    if (ui) { initAudio(); setMute(!muted); }
  });
  c.addEventListener("pointermove", (e) => {
    const q = ptrs.get(e.pointerId); if (!q || q.ui) return; e.preventDefault();
    const p = lpos(e), dx = p.x - q.ax, dy = p.y - q.ay;
    q.moved = Math.max(q.moved, Math.hypot(p.x - q.x, p.y - q.y));
    if (state !== "play") return;
    if (Math.abs(dx) >= 34 && Math.abs(dx) > Math.abs(dy) * 0.8) { doLane(Math.sign(dx)); q.ax = p.x; q.ay = p.y; q.swiped = true; }
    else if (dy <= -60 && Math.abs(dy) > Math.abs(dx)) { doSwap(); q.ax = p.x; q.ay = p.y; q.swiped = true; }
  });
  const endPtr = (e) => {
    const q = ptrs.get(e.pointerId); if (!q) return; ptrs.delete(e.pointerId);
    if (e.type === "pointerup" && !q.ui && !q.swiped && q.moved < 22 && performance.now() - q.t < 600) primary();
  };
  c.addEventListener("pointerup", endPtr); c.addEventListener("pointercancel", endPtr);
  c.addEventListener("contextmenu", (e) => e.preventDefault());
  addEventListener("keydown", (e) => {
    const k = e.key;
    if (k === "ArrowLeft" || k === "a" || k === "A") { doLane(-1); initAudio(); e.preventDefault(); }
    else if (k === "ArrowRight" || k === "d" || k === "D") { doLane(1); initAudio(); e.preventDefault(); }
    else if (k === " " || k === "ArrowUp" || k === "w" || k === "W" || k === "Enter") { if (!e.repeat) primary(); e.preventDefault(); }
    else if (k === "m" || k === "M") { initAudio(); setMute(!muted); }
  });
  addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
  if (window.Arcadia) { Arcadia.onPause(() => { paused = true; if (AC) AC.suspend(); }); Arcadia.onResume(() => { paused = false; if (AC && !muted) AC.resume(); last = performance.now(); }); }
  document.addEventListener("visibilitychange", () => { if (document.hidden) { paused = true; if (AC) AC.suspend(); } else { paused = false; last = performance.now(); if (AC) AC.resume(); } });
  c.focus();

  // ---------- fx helpers ----------
  function burst(x, y, col, n, v0) {
    for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), v = rnd(v0 * 0.4, v0); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: rnd(0.3, 0.7), max: 0.7, size: rnd(2, 5), col, g: 300 }); }
  }
  function pop(text, x, y, col, size) { pops.push({ text, x, y, col, size: size || 30, t: 0 }); }

  // ---------- update ----------
  function collect(it) {
    const px = X((it.lx - 1) * LW, 0), py = GY - 50;
    it.taken = true;
    if (it.k === "coin") {
      coins++;
      let pts;
      if (phaseT > 0) {
        phaseMult = 2 + Math.min(streak, 6);
        if (!phaseGot) { phaseGot = true; streak++; }
        pts = 10 * phaseMult; pop("+" + pts + "  PHASE x" + phaseMult, px, py - 70, pl.world ? "#7ffcff" : "#ffe27a", 28);
        burst(px, py, pl.world ? "#29f0ff" : "#ffd23f", 22, 520);
      } else { pts = 5; burst(px, py, "#ffd23f", 10, 320); }
      coinPts += pts; sfx.coin(phaseT > 0 ? streak : 0); scorePop = 1;
    } else {
      sfx.power(); burst(px, py, "#ffffff", 30, 500);
      if (it.pt === "magnet") { magnetT = 8; pop("MAGNET", px, py - 80, "#ff5c7a", 34); }
      else if (it.pt === "shield") { shield = true; pop("SHIELD", px, py - 80, "#7ffcff", 34); }
      else { slowT = 4; pop("SLOW-MO", px, py - 80, "#c9a4ff", 34); }
    }
  }
  function update(dt) {
    T += dt;
    const bt = pl.world;
    wb += clamp(bt - wb, -dt / 0.15, dt / 0.15);
    setPalette(wb);
    swapFx = Math.max(0, swapFx - dt * 3.2); hurtFx = Math.max(0, hurtFx - dt * 1.6); flash = Math.max(0, flash - dt * 3);
    shake = Math.max(0, shake - dt * 45); scorePop = Math.max(0, scorePop - dt * 4);
    bank *= Math.exp(-dt * 7);
    for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt / 0.55; if (rings[i].t >= 1) rings.splice(i, 1); }
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; } p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    if (parts.length > 500) parts.splice(0, parts.length - 500);
    for (let i = pops.length - 1; i >= 0; i--) { pops[i].t += dt; if (pops[i].t > 1) pops.splice(i, 1); }
    // speed lines
    while (lines.length < 16) lines.push({ a: rnd(0, 6.283), r: rnd(0, 1), l: rnd(0.1, 0.35) });

    if (state === "title" || state === "tutorial") {
      D += 620 * dt; speed = 620;
      demoSwapT -= dt; if (demoSwapT <= 0) { demoSwapT = 2.6; pl.world ^= 1; swapFx = 1; rings.push({ t: 0, world: pl.world }); sfx.swap(pl.world); }
      demoLaneT -= dt; if (demoLaneT <= 0) { demoLaneT = 1.1; demoLane = (demoLane + (Math.random() < 0.5 ? 1 : 2)) % 3; }
      pl.x += (demoLane - pl.x) * Math.min(1, dt * 5);
      camX = (pl.x - 1) * LW * 0.5;
      return;
    }
    if (state === "over") { overT += dt; D += 60 * dt; pl.vx = 0; camX = (pl.x - 1) * LW * 0.5; return; }
    if (hitstop > 0) { hitstop -= dt; return; }
    if (state === "dying") {
      overT += dt; D += speed * 0.08 * dt; if (overT > 1.05) toOver();
      camX = (pl.x - 1) * LW * 0.5; return;
    }
    // ---- play ----
    if (slowT > 0) slowT -= dt;
    const dw = dt * (slowT > 0 ? 0.55 : 1);
    runT += dw; speed = speedAt(runT) * (firstRun && runT < 6 ? 0.85 : 1);
    D += speed * dw;
    const px0 = pl.x; pl.x += (pl.lane - pl.x) * Math.min(1, dt * 17); pl.vx = (pl.x - px0) / Math.max(dt, 0.001);
    camX = (pl.x - 1) * LW * 0.5;
    if (magnetT > 0) magnetT -= dt; if (invulnT > 0) invulnT -= dt;
    if (phaseT > 0) { phaseT -= dt; if (phaseT <= 0 && !phaseGot) streak = 0; }
    while (nextRowZ < D + ZFAR + 600) genChunk();
    while (rows.length && rows[0].z < D - 500) rows.shift();
    hint = "";
    for (const r of rows) {
      const rel = r.z - D;
      if (rel > ZFAR) break;
      if (rel < -160) continue;
      if (firstRun && runT < 30 && rel > 150 && rel < 1500) {
        const blk = r.items.filter((i) => (i.k === "blk" || i.k === "drn") && i.world === pl.world).length;
        if (blk >= 3) hint = "TAP to PHASE";
        else if (r.str === "b.b" || (r.str === ".a." && !hint)) hint = "SWIPE to change lane";
      }
      for (const it of r.items) {
        if (it.taken) continue;
        if (it.k === "coin" || it.k === "pow") {
          if (magnetT > 0 && it.k === "coin" && rel < 1000 && rel > 0 && Math.abs(it.lx - pl.x) < 2.1) it.lx += (pl.x - it.lx) * Math.min(1, dt * 7);
          if (Math.abs(rel) < 70 && Math.abs(it.lx - pl.x) < 0.62) collect(it);
        } else if (!it.hit && it.world === pl.world) {
          const win = it.k === "gap" ? 62 : 52;
          if (Math.abs(rel) < win && Math.abs(it.lane - pl.x) < 0.56) {
            if (invulnT > 0) continue;
            if (shield) {
              shield = false; invulnT = 1.3; it.hit = true; sfx.shieldBreak(); shake = 16; flash = 0.6; swapFx = 1;
              burst(X((pl.x - 1) * LW, 0), GY - 50, "#7ffcff", 40, 600); pop("SHIELD BROKEN", W / 2, 440, "#7ffcff", 34);
              streak = 0;
            } else { endRun(); return; }
          }
        }
      }
    }
    // trail
    if (Math.random() < 0.9) parts.push({ x: X((pl.x - 1) * LW, 0) + rnd(-18, 18), y: GY - 4, vx: rnd(-30, 30), vy: rnd(80, 200), life: rnd(0.2, 0.4), max: 0.4, size: rnd(2, 4), col: pl.world ? "#29f0ff" : "#ffb020", g: 0 });
    const sc = totalScore(); lastScoreShown = sc;
  }

  // ---------- drawing: world ----------
  function skyBands() {
    const g = ctx.createLinearGradient(0, 0, 0, HZ + 10);
    g.addColorStop(0, CC.skyTop); g.addColorStop(0.55, CC.skyMid); g.addColorStop(1, CC.skyHor);
    ctx.fillStyle = g; ctx.fillRect(-100, -100, W + 200, HZ + 110);
  }
  const stars = []; { const r = mulberry(7); for (let i = 0; i < 70; i++) stars.push({ x: r() * W, y: r() * (HZ - 90), s: r() * 1.6 + 0.6, p: r() * 6 }); }
  const clouds = []; { const r = mulberry(11); for (let i = 0; i < 6; i++) clouds.push({ x: r() * W, y: 90 + r() * 180, w: 120 + r() * 160, s: 6 + r() * 10 }); }
  function drawSun() {
    ctx.save(); ctx.beginPath(); ctx.rect(-100, -100, W + 200, HZ + 100); ctx.clip();
    const sx = W / 2 - camX * 0.06;
    // sun
    const sy = HZ - 130 + wb * 250;
    if (wb < 0.98) {
      ctx.globalAlpha = 1 - wb;
      drawGlow("rgba(255,170,70,1)", sx, sy, 300, 0.8);
      ctx.save(); ctx.beginPath(); ctx.rect(0, sy - 120, W, 122);
      for (let i = 0; i < 6; i++) { const yy = sy + 2 + i * 15 + ((T * 8) % 15); const hh = 3 + i * 1.7; if (yy < sy + 125) ctx.rect(0, yy, W, hh); }
      ctx.rect(0, sy + 2, 0, 0); ctx.clip();
      const g = ctx.createLinearGradient(0, sy - 120, 0, sy + 120);
      g.addColorStop(0, "#fff7c4"); g.addColorStop(0.5, "#ffb84d"); g.addColorStop(1, "#ff4f6d");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, 120, 0, 6.283); ctx.fill(); ctx.restore();
      ctx.globalAlpha = 1;
    }
    // moon
    const my = HZ - 130 + (1 - wb) * 250, mx = W / 2 - camX * 0.06 + 70;
    if (wb > 0.02) {
      ctx.globalAlpha = wb;
      drawGlow("rgba(80,220,255,1)", mx, my, 280, 0.75);
      const g = ctx.createRadialGradient(mx - 30, my - 30, 10, mx, my, 105);
      g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#a7dcff");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mx, my, 100, 0, 6.283); ctx.fill();
      ctx.fillStyle = "rgba(90,120,190,0.28)";
      [[-32, -20, 22], [30, 18, 30], [-6, 42, 14], [38, -40, 12]].forEach((q) => { ctx.beginPath(); ctx.arc(mx + q[0], my + q[1], q[2], 0, 6.283); ctx.fill(); });
      // phase crescent shadow
      ctx.fillStyle = RA("skyMid", 0.35); ctx.beginPath(); ctx.arc(mx + 26, my - 6, 92, 0, 6.283); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  const layers = [];
  function makeSkyline() {
    const specs = [{ n: 26, hMin: 30, hMax: 95, key: "bFar", par: 0.04, drift: 3 }, { n: 20, hMin: 50, hMax: 150, key: "bMid", par: 0.09, drift: 8 }, { n: 14, hMin: 70, hMax: 200, key: "bNear", par: 0.16, drift: 16 }];
    const r = mulberry(99);
    specs.forEach((sp, li) => {
      const TW = 1500, bs = []; let x = 0;
      for (let i = 0; i < sp.n; i++) {
        const w = TW / sp.n * (0.7 + r() * 0.6), h = sp.hMin + r() * (sp.hMax - sp.hMin), b = { x, w, h, ant: r() < 0.25, win: [] };
        if (li === 2) for (let k = 0; k < 24; k++) b.win.push([Math.floor(r() * 5), Math.floor(r() * 12), r() < 0.5 ? 0 : 1]);
        bs.push(b); x += w;
      }
      layers.push({ sp, bs, TW: x });
    });
  }
  makeSkyline();
  function drawSkyline() {
    layers.forEach((L, li) => {
      const off = (-camX * L.sp.par * 3 - T * L.sp.drift) % L.TW;
      ctx.fillStyle = CC[L.sp.key];
      for (let rep = -1; rep < 3; rep++) {
        const bx0 = off + rep * L.TW;
        if (bx0 > W + 50 || bx0 + L.TW < -50) continue;
        for (const b of L.bs) {
          const x = bx0 + b.x; if (x > W + 60 || x + b.w < -60) continue;
          ctx.fillStyle = CC[L.sp.key]; ctx.fillRect(x, HZ - b.h, b.w - 2, b.h + 6);
          if (b.ant) { ctx.fillRect(x + b.w / 2 - 1, HZ - b.h - 24, 2, 24); }
          if (li >= 1) { ctx.fillStyle = RA("accent", 0.35 * wb + 0.12 * (1 - wb)); ctx.fillRect(x, HZ - b.h, b.w - 2, 2); }
          if (li === 2 && wb > 0.05) {
            ctx.fillStyle = "rgba(41,240,255," + 0.75 * wb + ")";
            ctx.beginPath();
            for (const w of b.win) { const wx = x + 5 + w[0] * ((b.w - 14) / 5), wy = HZ - b.h + 10 + w[1] * 12; if (wy < HZ - 4 && w[2] === 0) ctx.rect(wx, wy, 4, 5); }
            ctx.fill();
            ctx.fillStyle = "rgba(255,80,200," + 0.7 * wb + ")"; ctx.beginPath();
            for (const w of b.win) { const wx = x + 5 + w[0] * ((b.w - 14) / 5), wy = HZ - b.h + 10 + w[1] * 12; if (wy < HZ - 4 && w[2] === 1) ctx.rect(wx, wy, 4, 5); }
            ctx.fill();
          }
        }
      }
    });
  }
  function drawSky() {
    skyBands();
    ctx.globalAlpha = wb;
    ctx.fillStyle = "#fff";
    for (const s of stars) { ctx.globalAlpha = wb * (0.5 + 0.5 * Math.sin(T * 2 + s.p)); ctx.fillRect(s.x - camX * 0.02, s.y, s.s, s.s); }
    ctx.globalAlpha = 1;
    drawSun();
    if (wb < 0.98) {
      ctx.globalAlpha = (1 - wb) * 0.5;
      for (const cl of clouds) { const x = ((cl.x + T * cl.s - camX * 0.05) % (W + 300)) - 150; const g = ctx.createLinearGradient(x, 0, x + cl.w, 0); g.addColorStop(0, "rgba(255,240,220,0)"); g.addColorStop(0.5, "rgba(255,240,220,0.9)"); g.addColorStop(1, "rgba(255,240,220,0)"); ctx.fillStyle = g; ctx.fillRect(x, cl.y, cl.w, 5); ctx.fillRect(x + 30, cl.y + 10, cl.w * 0.6, 3); }
      ctx.globalAlpha = 1;
    }
    drawSkyline();
    // horizon haze
    const g = ctx.createLinearGradient(0, HZ - 60, 0, HZ + 30);
    g.addColorStop(0, RA("skyHor", 0)); g.addColorStop(0.7, RA("skyHor", 0.7)); g.addColorStop(1, RA("skyHor", 0));
    ctx.fillStyle = g; ctx.fillRect(-100, HZ - 60, W + 200, 90);
  }
  function drawGround() {
    const g = ctx.createLinearGradient(0, HZ, 0, H + 100);
    g.addColorStop(0, CC.roadFar); g.addColorStop(0.25, CC.gnd); g.addColorStop(1, CC.gnd);
    ctx.fillStyle = g; ctx.fillRect(-100, HZ, W + 200, H - HZ + 200);
    // ground grid
    const GRID = 200, zoff = D % GRID;
    ctx.lineWidth = 1.5;
    for (let z = -zoff - 40; z < ZFAR; z += GRID) {
      if (z < -70) continue;
      const y = Y(z); ctx.strokeStyle = RA("grid", 0.55 * (1 - z / ZFAR) + 0.05);
      ctx.beginPath(); ctx.moveTo(-100, y); ctx.lineTo(W + 100, y); ctx.stroke();
    }
    for (let i = -9; i <= 9; i++) {
      const wx = i * 170, x0 = X(wx, ZFAR), y0 = Y(ZFAR), x1 = X(wx, -70), y1 = Y(-70);
      ctx.strokeStyle = RA("grid", 0.4); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    // road
    const zn = -70, zf = ZFAR;
    const rg = ctx.createLinearGradient(0, HZ, 0, H);
    rg.addColorStop(0, RA("roadFar", 0.95)); rg.addColorStop(0.35, RA("road", 0.94)); rg.addColorStop(1, RA("road", 0.98));
    ctx.fillStyle = rg; ctx.beginPath();
    ctx.moveTo(X(-RH, zf), Y(zf)); ctx.lineTo(X(RH, zf), Y(zf)); ctx.lineTo(X(RH, zn), Y(zn)); ctx.lineTo(X(-RH, zn), Y(zn)); ctx.closePath(); ctx.fill();
    // current lane highlight
    const lw = pl.x - 1;
    ctx.fillStyle = RA("accent", 0.07); ctx.beginPath();
    ctx.moveTo(X((lw - 0.5) * LW, zf), Y(zf)); ctx.lineTo(X((lw + 0.5) * LW, zf), Y(zf)); ctx.lineTo(X((lw + 0.5) * LW, zn), Y(zn)); ctx.lineTo(X((lw - 0.5) * LW, zn), Y(zn)); ctx.closePath(); ctx.fill();
    // cross lines on road
    for (let z = -zoff - 40; z < ZFAR; z += GRID) {
      if (z < -70) continue;
      ctx.strokeStyle = RA("grid", 0.22 * (1 - z / ZFAR)); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(X(-RH, z), Y(z)); ctx.lineTo(X(RH, z), Y(z)); ctx.stroke();
    }
    // lane dashes
    const per = 240, doff = D % per;
    for (const lx of [-LW / 2, LW / 2]) {
      for (let z = -doff - per; z < ZFAR; z += per) {
        const za = Math.max(z, -70), zb = z + 110; if (zb < -70) continue;
        ctx.strokeStyle = RA("edge", 0.55 * (1 - za / ZFAR) + 0.1); ctx.lineWidth = Math.max(1, 7 * S((za + zb) / 2));
        ctx.beginPath(); ctx.moveTo(X(lx, za), Y(za)); ctx.lineTo(X(lx, zb), Y(zb)); ctx.stroke();
      }
    }
    // edges
    for (const sx of [-1, 1]) {
      ctx.strokeStyle = RA("edge", 0.25); ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(X(sx * RH, zf), Y(zf)); ctx.lineTo(X(sx * RH, zn), Y(zn)); ctx.stroke();
      ctx.strokeStyle = CC.edge; ctx.lineWidth = 4; ctx.stroke();
      ctx.strokeStyle = RA("edge2", 0.7); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(sx * (RH + 26), zf), Y(zf)); ctx.lineTo(X(sx * (RH + 26), zn), Y(zn)); ctx.stroke();
    }
  }
  function bhash(k) { let x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function drawBuildings() {
    const BSP = 420, base = Math.floor(D / BSP);
    for (let i = Math.ceil(ZFAR / BSP); i >= -1; i--) {
      const k = base + i, zb = k * BSP - D;
      if (zb > ZFAR || zb < -140) continue;
      for (const sd of [-1, 1]) {
        const hh = bhash(k * 2 + (sd > 0 ? 1 : 0));
        const hgt = 260 + hh * 520, wid = 200 + bhash(k * 3 + sd) * 140, dep = 300, xin = RH + 70 + bhash(k + 9 + sd) * 30;
        const z0 = zb, z1 = zb + dep;
        const fog = clamp((ZFAR - z0) / 900, 0, 1);
        if (fog <= 0) continue;
        const xi0 = X(sd * xin, z0), xo0 = X(sd * (xin + wid), z0), xi1 = X(sd * xin, z1), yb0 = Y(z0), yb1 = Y(z1);
        const s0 = S(z0), s1 = S(z1), yt0 = yb0 - hgt * s0, yt1 = yb1 - hgt * s1;
        ctx.globalAlpha = fog;
        // inner side face
        ctx.fillStyle = CC.side; ctx.beginPath(); ctx.moveTo(xi0, yb0); ctx.lineTo(xi1, yb1); ctx.lineTo(xi1, yt1); ctx.lineTo(xi0, yt0); ctx.closePath(); ctx.fill();
        // front face
        const fg = ctx.createLinearGradient(0, yt0, 0, yb0); fg.addColorStop(0, CC.face); fg.addColorStop(1, CC.bNear);
        ctx.fillStyle = fg; ctx.fillRect(Math.min(xi0, xo0), yt0, Math.abs(xo0 - xi0), yb0 - yt0);
        // top (if eye above roof)
        if (hgt < GY - HZ) { ctx.fillStyle = CC.bMid; ctx.beginPath(); ctx.moveTo(xi0, yt0); ctx.lineTo(xo0, yt0); ctx.lineTo(X(sd * (xin + wid), z1), yt1); ctx.lineTo(xi1, yt1); ctx.closePath(); ctx.fill(); }
        // neon strips on inner face
        ctx.lineWidth = Math.max(1, 3 * s0);
        const nst = 1 + Math.floor(hh * 4);
        for (let n = 1; n <= nst; n++) {
          const hgh = (hgt * n) / (nst + 1);
          ctx.strokeStyle = n % 2 ? RA("accent", 0.85) : RA("accent2", 0.85);
          ctx.beginPath(); ctx.moveTo(xi0, yb0 - hgh * s0); ctx.lineTo(xi1, yb1 - hgh * s1); ctx.stroke();
        }
        // vertical accent edge on front
        ctx.strokeStyle = RA("accent", 0.9); ctx.lineWidth = Math.max(1, 4 * s0);
        ctx.beginPath(); ctx.moveTo(xi0, yt0); ctx.lineTo(xi0, yb0); ctx.stroke();
        // windows on front
        ctx.fillStyle = RA("accent", 0.35 + 0.35 * wb); ctx.beginPath();
        const cols = 4, rws = Math.floor(hgt / 70);
        const fw = Math.abs(xo0 - xi0);
        for (let ry = 0; ry < rws; ry++) for (let cx = 0; cx < cols; cx++) {
          if (bhash(k * 7 + ry * 13 + cx * 5 + sd) < 0.55) continue;
          const wx = Math.min(xi0, xo0) + fw * (0.1 + cx * 0.22), wy = yb0 - (ry + 0.7) * 70 * s0;
          ctx.rect(wx, wy, fw * 0.12, 26 * s0);
        }
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  // ---------- drawing: objects ----------
  const WCOL = [{ main: "#ffb020", hi: "#ffe27a", lo: "#c4501a", glow: "rgba(255,150,40,1)" }, { main: "#7a4dff", hi: "#b9a0ff", lo: "#2a1478", glow: "rgba(60,230,255,1)", line: "#29f0ff" }];
  function drawBlock(x, gy, s, w, ghost, a) {
    const bw = 112 * s, bh = 118 * s, dep = 52;
    const bz = 0; // depth offset in screen via s
    const topOff = 20 * s;
    const P = WCOL[w];
    ctx.globalAlpha = a;
    if (w === 0) {
      if (ghost) { ctx.strokeStyle = P.main; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.strokeRect(x - bw / 2, gy - bh, bw, bh); ctx.setLineDash([]); ctx.globalAlpha = 1; return; }
      drawGlow(P.glow, x, gy - bh * 0.5, bw * 1.4, 0.35 * a);
      // top face
      ctx.fillStyle = P.hi; ctx.beginPath(); ctx.moveTo(x - bw / 2, gy - bh); ctx.lineTo(x + bw / 2, gy - bh); ctx.lineTo(x + bw / 2 - bw * 0.06, gy - bh - topOff); ctx.lineTo(x - bw / 2 + bw * 0.06, gy - bh - topOff); ctx.closePath(); ctx.fill();
      const g = ctx.createLinearGradient(0, gy - bh, 0, gy); g.addColorStop(0, P.main); g.addColorStop(1, P.lo);
      ctx.fillStyle = g; ctx.fillRect(x - bw / 2, gy - bh, bw, bh);
      // hazard chevrons
      ctx.save(); ctx.beginPath(); ctx.rect(x - bw / 2, gy - bh * 0.62, bw, bh * 0.3); ctx.clip();
      ctx.fillStyle = "rgba(60,15,20,0.75)";
      for (let i = -2; i < 8; i++) { const sx = x - bw / 2 + i * bw * 0.22; ctx.beginPath(); ctx.moveTo(sx, gy - bh * 0.32); ctx.lineTo(sx + bw * 0.11, gy - bh * 0.32); ctx.lineTo(sx + bw * 0.22, gy - bh * 0.62); ctx.lineTo(sx + bw * 0.11, gy - bh * 0.62); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      ctx.strokeStyle = "#fff2b8"; ctx.lineWidth = Math.max(1, 3 * s); ctx.strokeRect(x - bw / 2, gy - bh, bw, bh);
      ctx.fillStyle = "#fff6d0"; ctx.beginPath(); ctx.arc(x, gy - bh * 0.83, bh * 0.07, 0, 6.283); ctx.fill();
    } else {
      // obelisk
      const path = () => { ctx.beginPath(); ctx.moveTo(x - bw / 2, gy); ctx.lineTo(x - bw * 0.3, gy - bh * 0.8); ctx.lineTo(x, gy - bh * 1.22); ctx.lineTo(x + bw * 0.3, gy - bh * 0.8); ctx.lineTo(x + bw / 2, gy); ctx.closePath(); };
      if (ghost) { path(); ctx.strokeStyle = P.line; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; return; }
      drawGlow(P.glow, x, gy - bh * 0.55, bw * 1.5, 0.5 * a);
      const g = ctx.createLinearGradient(0, gy - bh * 1.2, 0, gy); g.addColorStop(0, "#9a7bff"); g.addColorStop(0.5, P.main); g.addColorStop(1, P.lo);
      path(); ctx.fillStyle = g; ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.13)"; ctx.beginPath(); ctx.moveTo(x, gy - bh * 1.22); ctx.lineTo(x + bw * 0.3, gy - bh * 0.8); ctx.lineTo(x + bw / 2, gy); ctx.lineTo(x, gy); ctx.closePath(); ctx.fill();
      path(); ctx.strokeStyle = P.line; ctx.lineWidth = Math.max(1.5, 3 * s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, gy - bh * 1.22); ctx.lineTo(x, gy); ctx.strokeStyle = "rgba(120,250,255,0.7)"; ctx.lineWidth = Math.max(1, 2 * s); ctx.stroke();
      for (let i = 1; i < 4; i++) { const yy = gy - bh * 0.25 * i, ww = bw * (0.5 - i * 0.05); ctx.beginPath(); ctx.moveTo(x - ww / 2, yy); ctx.lineTo(x + ww / 2, yy); ctx.strokeStyle = "rgba(41,240,255,0.6)"; ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
  }
  function drawDrone(x, gy, s, w, ghost, a) {
    const bob = Math.sin(T * 4 + x * 0.05) * 7 * s, cy = gy - 78 * s + bob, r = 50 * s, P = WCOL[w];
    ctx.globalAlpha = a;
    // ground shadow
    ctx.fillStyle = "rgba(0,0,0," + (ghost ? 0 : 0.35) + ")"; ctx.beginPath(); ctx.ellipse(x, gy, r * 0.9, r * 0.22, 0, 0, 6.283); ctx.fill();
    if (w === 0) {
      if (ghost) { ctx.strokeStyle = P.main; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.arc(x, cy, r, 0, 6.283); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; return; }
      drawGlow(P.glow, x, cy, r * 2.6, 0.7 * a);
      ctx.fillStyle = "#ff7a2a"; const rot = T * 1.5;
      for (let i = 0; i < 10; i++) { const an = rot + (i * 6.283) / 10; ctx.beginPath(); ctx.moveTo(x + Math.cos(an - 0.13) * r * 0.9, cy + Math.sin(an - 0.13) * r * 0.9); ctx.lineTo(x + Math.cos(an) * r * 1.5, cy + Math.sin(an) * r * 1.5); ctx.lineTo(x + Math.cos(an + 0.13) * r * 0.9, cy + Math.sin(an + 0.13) * r * 0.9); ctx.closePath(); ctx.fill(); }
      const g = ctx.createRadialGradient(x - r * 0.3, cy - r * 0.3, 1, x, cy, r); g.addColorStop(0, "#fff7c4"); g.addColorStop(0.6, "#ffb020"); g.addColorStop(1, "#e2452a");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, cy, r, 0, 6.283); ctx.fill();
      ctx.fillStyle = "#3a0d1a"; ctx.beginPath(); ctx.ellipse(x, cy, r * 0.55, r * 0.26, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = "#ffef9a"; ctx.beginPath(); ctx.arc(x, cy, r * 0.13, 0, 6.283); ctx.fill();
    } else {
      const path = () => { ctx.beginPath(); ctx.moveTo(x, cy - r * 1.25); ctx.lineTo(x + r * 1.05, cy); ctx.lineTo(x, cy + r * 1.25); ctx.lineTo(x - r * 1.05, cy); ctx.closePath(); };
      if (ghost) { path(); ctx.strokeStyle = P.line; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; return; }
      drawGlow(P.glow, x, cy, r * 2.8, 0.8 * a);
      const g = ctx.createLinearGradient(0, cy - r, 0, cy + r); g.addColorStop(0, "#a58cff"); g.addColorStop(1, "#3a1a9a");
      path(); ctx.fillStyle = g; ctx.fill(); path(); ctx.strokeStyle = P.line; ctx.lineWidth = Math.max(1.5, 3 * s); ctx.stroke();
      // wings
      ctx.beginPath(); ctx.moveTo(x - r * 1.05, cy); ctx.lineTo(x - r * 1.7, cy - r * 0.5 + Math.sin(T * 12) * r * 0.2); ctx.lineTo(x - r * 1.05, cy + r * 0.3);
      ctx.moveTo(x + r * 1.05, cy); ctx.lineTo(x + r * 1.7, cy - r * 0.5 + Math.sin(T * 12) * r * 0.2); ctx.lineTo(x + r * 1.05, cy + r * 0.3); ctx.strokeStyle = P.line; ctx.stroke();
      ctx.fillStyle = "#e9ffff"; ctx.beginPath(); ctx.ellipse(x, cy, r * 0.32, r * 0.5, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = "#1a0a4a"; ctx.beginPath(); ctx.ellipse(x, cy, r * 0.13, r * 0.4, 0, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function drawGap(lx, z, w, ghost, a) {
    const za = z - 78, zb = z + 78, hw = LW * 0.5 - 4, wx = (lx - 1) * LW, P = WCOL[w];
    const q = (zz, d) => [X(wx - hw, zz), Y(zz) + d, X(wx + hw, zz), Y(zz) + d];
    const A = q(za, 0), B = q(zb, 0);
    ctx.globalAlpha = a;
    if (ghost) {
      ctx.strokeStyle = w ? "#29f0ff" : "#ffb020"; ctx.lineWidth = 2; ctx.setLineDash([7, 6]);
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(A[2], A[3]); ctx.lineTo(B[2], B[3]); ctx.lineTo(B[0], B[1]); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = 1; return;
    }
    // hole
    ctx.fillStyle = "#000"; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(A[2], A[3]); ctx.lineTo(B[2], B[3]); ctx.lineTo(B[0], B[1]); ctx.closePath(); ctx.fill();
    const sb = S(zb); const dpt = 70 * sb;
    const g = ctx.createLinearGradient(0, B[1], 0, B[1] + dpt); g.addColorStop(0, w ? "#3a1a9a" : "#ff5a2a"); g.addColorStop(1, "#000");
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(B[0], B[1]); ctx.lineTo(B[2], B[3]); ctx.lineTo(B[2] - (B[2] - B[0]) * 0.1, B[3] + dpt); ctx.lineTo(B[0] + (B[2] - B[0]) * 0.1, B[1] + dpt); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.92)"; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(A[2], A[3]); ctx.lineTo(B[2], B[3]); ctx.lineTo(B[0], B[1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = w ? "#29f0ff" : "#ffb020"; ctx.lineWidth = Math.max(1.5, 4 * S(z)); ctx.shadowColor = P.glow; ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(A[2], A[3]); ctx.lineTo(B[2], B[3]); ctx.lineTo(B[0], B[1]); ctx.closePath(); ctx.stroke();
    drawGlow(P.glow, (A[0] + A[2]) / 2, (A[1] + B[1]) / 2, Math.abs(A[2] - A[0]) * 0.9, 0.45 * a);
    // warning stripes on lip
    ctx.strokeStyle = w ? "rgba(160,120,255,0.8)" : "rgba(255,230,120,0.9)"; ctx.lineWidth = Math.max(1, 2.5 * S(z));
    for (let i = 1; i < 5; i++) { const t = i / 5; ctx.beginPath(); ctx.moveTo(lerp(A[0], A[2], t), A[1]); ctx.lineTo(lerp(B[0], B[2], t), B[1]); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  function drawCoin(x, gy, s, hot) {
    const r = 24 * s, cy = gy - 52 * s + Math.sin(T * 5 + x) * 3 * s;
    if (hot) drawGlow("rgba(255,215,60,1)", x, cy, r * 3.2, 0.9);
    else drawGlow("rgba(255,200,60,1)", x, cy, r * 2.2, 0.45);
    const sp = Math.abs(Math.cos(T * 6 + x * 0.02)), rw = Math.max(r * 0.18, r * sp);
    ctx.fillStyle = "#c98a00"; ctx.beginPath(); ctx.ellipse(x, cy, rw + r * 0.1, r * 1.04, 0, 0, 6.283); ctx.fill();
    const g = ctx.createLinearGradient(x - rw, cy - r, x + rw, cy + r); g.addColorStop(0, "#fff6b0"); g.addColorStop(0.5, "#ffd23a"); g.addColorStop(1, "#ff9d00");
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, cy, rw, r, 0, 0, 6.283); ctx.fill();
    if (rw > r * 0.5) { ctx.strokeStyle = "rgba(160,90,0,0.6)"; ctx.lineWidth = Math.max(1, 2 * s); ctx.beginPath(); ctx.ellipse(x, cy, rw * 0.62, r * 0.62, 0, 0, 6.283); ctx.stroke(); }
  }
  function drawPower(x, gy, s, pt) {
    const r = 34 * s, cy = gy - 70 * s + Math.sin(T * 3) * 6 * s;
    const col = pt === "magnet" ? "rgba(255,80,110,1)" : pt === "shield" ? "rgba(90,240,255,1)" : "rgba(180,130,255,1)";
    drawGlow(col, x, cy, r * 3.2, 0.9);
    ctx.save(); ctx.translate(x, cy); ctx.rotate(Math.sin(T * 2) * 0.15);
    ctx.fillStyle = "rgba(10,8,30,0.85)"; ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i * 6.283) / 6 + 0.5236; ctx.lineTo(Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15); } ctx.closePath(); ctx.fill();
    ctx.strokeStyle = col.replace("1)", "1)"); ctx.lineWidth = Math.max(2, 4 * s); ctx.stroke();
    iconPower(pt, r * 0.7, "#fff"); ctx.restore();
  }
  function iconPower(pt, r, col) {
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(2, r * 0.28); ctx.lineCap = "round";
    if (pt === "magnet") { ctx.beginPath(); ctx.arc(0, -r * 0.1, r * 0.7, 0, Math.PI); ctx.lineTo(-r * 0.7, -r * 0.8); ctx.moveTo(r * 0.7, -r * 0.1); ctx.lineTo(r * 0.7, -r * 0.8); ctx.stroke(); }
    else if (pt === "shield") { ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.85, -r * 0.55); ctx.lineTo(r * 0.7, r * 0.3); ctx.quadraticCurveTo(0, r * 1.1, -r * 0.7, r * 0.3); ctx.lineTo(-r * 0.85, -r * 0.55); ctx.closePath(); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, 6.283); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -r * 0.5); ctx.lineTo(0, 0); ctx.lineTo(r * 0.4, r * 0.25); ctx.stroke(); }
    ctx.lineCap = "butt";
  }
  function drawItem(it, rel, isGhostPass) {
    const s = S(rel), wx = (it.lx - 1) * LW, x = X(wx, rel), gy = Y(rel);
    const fog = clamp((ZFAR - rel) / 800, 0, 1) * (rel < 0 ? clamp(1 + rel / 140, 0, 1) : 1);
    if (fog <= 0) return;
    if (it.k === "coin") { if (!it.taken) drawCoin(x, gy, s, phaseT > 0); return; }
    if (it.k === "pow") { if (!it.taken) drawPower(x, gy, s, it.pt); return; }
    if (it.hit) return;
    const solid = it.world === 0 ? 1 - wb : wb;
    const ghostA = (1 - solid) * 0.55;
    if (it.k === "gap") { if (solid > 0.05) drawGap(it.lane, rel, it.world, false, fog * solid); if (ghostA > 0.05) drawGap(it.lane, rel, it.world, true, fog * ghostA); return; }
    const fn = it.k === "blk" ? drawBlock : drawDrone;
    if (solid > 0.05) fn(x, gy, s, it.world, false, fog * solid);
    if (ghostA > 0.05) fn(x, gy, s, it.world, true, fog * ghostA);
  }
  function drawRowsPass(front) {
    // gaps are painted flat first
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i], rel = r.z - D;
      if (rel > ZFAR || rel < -140) continue;
      if ((rel >= 0) === front) continue;
      for (const it of r.items) if (it.k === "gap") drawItem(it, rel);
    }
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i], rel = r.z - D;
      if (rel > ZFAR || rel < -140) continue;
      if ((rel >= 0) === front) continue;
      for (const it of r.items) if (it.k !== "gap") drawItem(it, rel);
    }
  }
  function drawPlayer(alpha) {
    const x = X((pl.x - 1) * LW, 0), gy = GY, hov = 34 + Math.sin(T * 6) * 3;
    const acc = pl.world ? ["#29f0ff", "#a855ff", "rgba(41,240,255,1)"] : ["#ffb020", "#ff4d6d", "rgba(255,150,40,1)"];
    const tilt = clamp(pl.vx * 0.0012 + (pl.lane - pl.x) * 0.25, -0.5, 0.5);
    if (invulnT > 0 && Math.floor(T * 20) % 2) alpha *= 0.4;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.beginPath(); ctx.ellipse(x, gy + 6, 62, 13, 0, 0, 6.283); ctx.fill();
    drawGlow(acc[2], x, gy + 4, 90, 0.5);
    ctx.save(); ctx.translate(x, gy - hov); ctx.rotate(tilt);
    // flames
    const fl = 26 + Math.random() * 12 + (speed - 600) * 0.02;
    for (const ex of [-24, 24]) {
      drawGlow(acc[2], ex, 6, 44, 0.8);
      const g = ctx.createLinearGradient(0, 0, 0, fl); g.addColorStop(0, "#ffffff"); g.addColorStop(0.3, acc[0]); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(ex - 9, 0); ctx.lineTo(ex, fl); ctx.lineTo(ex + 9, 0); ctx.closePath(); ctx.fill();
    }
    // wings
    const wing = ctx.createLinearGradient(0, -80, 0, 10); wing.addColorStop(0, "#f4f8ff"); wing.addColorStop(0.5, "#b9c4e8"); wing.addColorStop(1, "#5a5f9a");
    ctx.fillStyle = "#23204a"; ctx.beginPath(); ctx.moveTo(-70, 2); ctx.lineTo(-24, -58); ctx.lineTo(0, -84); ctx.lineTo(24, -58); ctx.lineTo(70, 2); ctx.lineTo(36, 8); ctx.lineTo(0, -4); ctx.lineTo(-36, 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = wing; ctx.beginPath(); ctx.moveTo(-64, -3); ctx.lineTo(-22, -56); ctx.lineTo(0, -80); ctx.lineTo(22, -56); ctx.lineTo(64, -3); ctx.lineTo(32, 2); ctx.lineTo(0, -10); ctx.lineTo(-32, 2); ctx.closePath(); ctx.fill();
    // accent stripes
    ctx.fillStyle = acc[0]; ctx.beginPath(); ctx.moveTo(-64, -3); ctx.lineTo(-48, -22); ctx.lineTo(-30, -6); ctx.lineTo(-32, 2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(64, -3); ctx.lineTo(48, -22); ctx.lineTo(30, -6); ctx.lineTo(32, 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = acc[1]; ctx.beginPath(); ctx.moveTo(-10, -22); ctx.lineTo(0, -60); ctx.lineTo(10, -22); ctx.lineTo(0, -10); ctx.closePath(); ctx.fill();
    // canopy
    const cg = ctx.createLinearGradient(0, -70, 0, -30); cg.addColorStop(0, "#ffffff"); cg.addColorStop(1, acc[0]);
    ctx.fillStyle = "#12102e"; ctx.beginPath(); ctx.ellipse(0, -42, 13, 21, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = cg; ctx.globalAlpha = alpha * 0.85; ctx.beginPath(); ctx.ellipse(0, -46, 8, 14, 0, 0, 6.283); ctx.fill(); ctx.globalAlpha = alpha;
    ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-64, -3); ctx.lineTo(-22, -56); ctx.lineTo(0, -80); ctx.lineTo(22, -56); ctx.lineTo(64, -3); ctx.stroke();
    if (shield) {
      const pulse = 1 + Math.sin(T * 8) * 0.04;
      ctx.beginPath(); ctx.arc(0, -36, 84 * pulse, 0, 6.283); const sg = ctx.createRadialGradient(0, -36, 40, 0, -36, 84); sg.addColorStop(0, "rgba(90,240,255,0)"); sg.addColorStop(1, "rgba(90,240,255,0.4)");
      ctx.fillStyle = sg; ctx.fill(); ctx.strokeStyle = "rgba(160,250,255,0.9)"; ctx.lineWidth = 3; ctx.stroke();
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }
  function drawSpeedLines() {
    const k = clamp((speed - 640) / 700, 0, 1) + (slowT > 0 ? 0 : 0);
    if (k <= 0.02 && state !== "title") return;
    const vx = W / 2, vy = HZ + 20;
    ctx.lineCap = "round";
    for (const l of lines) {
      l.r += (0.7 + k * 1.8) * 0.016 * (0.6 + l.l * 2); if (l.r > 1) { l.r = 0.05; l.a = rnd(0, 6.283); l.l = rnd(0.1, 0.35); }
      const r0 = l.r * l.r * 760 + 60, r1 = r0 + l.l * 240 * (0.4 + k) * l.r;
      const ax = Math.cos(l.a), ay = Math.sin(l.a) * 1.15;
      if (Math.abs(ax) < 0.2 && ay < 0) continue;
      ctx.strokeStyle = RA("accent", (0.12 + 0.35 * k) * l.r); ctx.lineWidth = 1 + l.r * 3;
      ctx.beginPath(); ctx.moveTo(vx + ax * r0, vy + ay * r0); ctx.lineTo(vx + ax * r1, vy + ay * r1); ctx.stroke();
    }
    ctx.lineCap = "butt";
  }
  function drawParticles() {
    ctx.globalCompositeOperation = "lighter";
    for (const p of parts) {
      const a = clamp(p.life / p.max, 0, 1); ctx.globalAlpha = a; ctx.fillStyle = p.col;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    for (const r of rings) {
      const t = r.t, px = X((pl.x - 1) * LW, 0), py = GY - 50, rad = 20 + t * 900;
      const col = r.world ? "41,240,255" : "255,176,32";
      const g = ctx.createRadialGradient(px, py, Math.max(0, rad - 90), px, py, rad + 4);
      g.addColorStop(0, "rgba(" + col + ",0)"); g.addColorStop(0.85, "rgba(" + col + "," + 0.35 * (1 - t) + ")"); g.addColorStop(1, "rgba(255,255,255," + 0.9 * (1 - t) + ")");
      ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, rad + 4, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  }
  function chroma() {
    const k = Math.max(swapFx, hurtFx * 0.8);
    if (k < 0.05) return;
    const w = c.width, h = c.height;
    if (!bufR || bufR.width !== w) { bufR = document.createElement("canvas"); bufC = document.createElement("canvas"); bufR.width = bufC.width = w; bufR.height = bufC.height = h; }
    const a = bufR.getContext("2d"), b = bufC.getContext("2d");
    a.globalCompositeOperation = "copy"; a.drawImage(c, 0, 0); a.globalCompositeOperation = "multiply"; a.fillStyle = "#ff0000"; a.fillRect(0, 0, w, h);
    b.globalCompositeOperation = "copy"; b.drawImage(c, 0, 0); b.globalCompositeOperation = "multiply"; b.fillStyle = "#00ffff"; b.fillRect(0, 0, w, h);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const d = Math.round(k * 16 * (w / W));
    ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter"; ctx.drawImage(bufR, d, 0); ctx.drawImage(bufC, -d, 0);
    ctx.restore();
  }

  // ---------- HUD & screens ----------
  function drawPill(x, y, w, h, fill, stroke) { rr(x, y, w, h, h / 2); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); } }
  function drawMute() {
    const cx = MUTE.x + MUTE.w / 2, cy = MUTE.y + MUTE.h / 2;
    ctx.fillStyle = "rgba(8,6,30,0.55)"; ctx.beginPath(); ctx.arc(cx, cy, 24, 0, 6.283); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(cx - 10, cy - 4); ctx.lineTo(cx - 5, cy - 4); ctx.lineTo(cx + 2, cy - 10); ctx.lineTo(cx + 2, cy + 10); ctx.lineTo(cx - 5, cy + 4); ctx.lineTo(cx - 10, cy + 4); ctx.closePath(); ctx.fill();
    if (muted) { ctx.strokeStyle = "#ff6b7a"; ctx.beginPath(); ctx.moveTo(cx + 7, cy - 6); ctx.lineTo(cx + 16, cy + 6); ctx.moveTo(cx + 16, cy - 6); ctx.lineTo(cx + 7, cy + 6); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(cx + 3, cy, 7, -0.9, 0.9); ctx.stroke(); ctx.beginPath(); ctx.arc(cx + 3, cy, 12, -0.9, 0.9); ctx.stroke(); }
    ctx.lineCap = "butt";
  }
  function drawHUD() {
    const sc = totalScore();
    const k = 1 + scorePop * 0.18;
    ctx.save(); ctx.translate(W / 2, 66); ctx.scale(k, k);
    txt(String(sc), 0, 0, 62, "#fff", "center", 900, pl.world ? "#29f0ff" : "#ff9a3d"); ctx.restore();
    txt("BEST " + Math.max(best, sc), W / 2, 112, 18, "rgba(255,255,255,0.75)", "center", 700);
    // coins
    drawPill(20, 28, 116, 40, "rgba(8,6,30,0.5)", "rgba(255,255,255,0.25)");
    ctx.fillStyle = "#ffd23a"; ctx.beginPath(); ctx.arc(44, 48, 11, 0, 6.283); ctx.fill(); ctx.strokeStyle = "#a86a00"; ctx.lineWidth = 2; ctx.stroke();
    txt(String(coins), 64, 49, 24, "#fff", "left", 800);
    drawMute();
    // streak chip
    if (streak > 0) {
      const mult = 2 + Math.min(streak - (phaseGot ? 1 : 0), 6);
      const w = 200; drawPill(W / 2 - w / 2, 134, w, 34, "rgba(8,6,30,0.55)", pl.world ? "#29f0ff" : "#ffb020");
      txt("PHASE STREAK x" + streak, W / 2, 151, 18, pl.world ? "#7ffcff" : "#ffe27a", "center", 800);
      if (phaseT > 0) { ctx.fillStyle = pl.world ? "#29f0ff" : "#ffb020"; ctx.fillRect(W / 2 - w / 2 + 14, 166, (w - 28) * phaseT, 3); }
    } else if (phaseT > 0) {
      txt("PHASE BONUS", W / 2, 150, 16, "rgba(255,255,255,0.8)", "center", 800);
    }
    // power timers
    let px = 20;
    const pw = [];
    if (magnetT > 0) pw.push(["magnet", magnetT / 8, "#ff5c7a"]);
    if (shield) pw.push(["shield", 1, "#5af0ff"]);
    if (slowT > 0) pw.push(["slow", slowT / 4, "#c9a4ff"]);
    for (const p of pw) {
      ctx.fillStyle = "rgba(8,6,30,0.55)"; ctx.beginPath(); ctx.arc(px + 22, 104, 22, 0, 6.283); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(px + 22, 104, 19, 0, 6.283); ctx.stroke();
      ctx.strokeStyle = p[2]; ctx.beginPath(); ctx.arc(px + 22, 104, 19, -1.5708, -1.5708 + 6.283 * p[1]); ctx.stroke();
      ctx.save(); ctx.translate(px + 22, 104); iconPower(p[0], 9, "#fff"); ctx.restore();
      px += 52;
    }
    // world slider
    const bx = W / 2 - 92, by = H - 54;
    drawPill(bx, by, 184, 36, "rgba(8,6,30,0.6)", "rgba(255,255,255,0.3)");
    const kx = lerp(bx + 22, bx + 162, wb);
    drawGlow(pl.world ? "rgba(41,240,255,1)" : "rgba(255,170,50,1)", kx, by + 18, 34, 0.9);
    ctx.fillStyle = pl.world ? "#29f0ff" : "#ffb020"; ctx.beginPath(); ctx.arc(kx, by + 18, 14, 0, 6.283); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.font = "800 11px " + FONT; ctx.textAlign = "center";
    ctx.fillText("DAY", bx + 52, by + 19); ctx.fillText("NIGHT", bx + 132, by + 19);
    // hint
    if (hint) { const a = 0.6 + 0.4 * Math.sin(T * 8); ctx.globalAlpha = a; drawPill(W / 2 - 150, 560, 300, 54, "rgba(8,6,30,0.65)", "#fff"); txt(hint, W / 2, 587, 26, "#fff", "center", 900); ctx.globalAlpha = 1; }
    for (const p of pops) { const a = 1 - p.t; ctx.globalAlpha = clamp(a * 1.6, 0, 1); txt(p.text, p.x, p.y - p.t * 60, p.size, p.col, "center", 900, "rgba(0,0,0,0.8)"); ctx.globalAlpha = 1; }
  }
  function logo(cx, y, size) {
    const words = [["PHASE", 0], ["RUNNER", 1]];
    ctx.font = "italic 900 " + size + 'px "Arial Black", Impact, ' + FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    words.forEach((wd, i) => {
      const yy = y + i * size * 0.98 + Math.sin(T * 2 + i) * 3, off = 6 + Math.sin(T * 3) * 2;
      const ww = ctx.measureText(wd[0]).width;
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(255,40,120,0.85)"; ctx.fillText(wd[0], cx - off, yy);
      ctx.fillStyle = "rgba(20,220,255,0.85)"; ctx.fillText(wd[0], cx + off, yy);
      ctx.globalCompositeOperation = "source-over";
      const g = ctx.createLinearGradient(0, yy - size / 2, 0, yy + size / 2);
      if (i === 0) { g.addColorStop(0, "#fff8d8"); g.addColorStop(0.5, "#ffc95a"); g.addColorStop(1, "#ff6a4a"); } else { g.addColorStop(0, "#e8ffff"); g.addColorStop(0.5, "#56e8ff"); g.addColorStop(1, "#8a5cff"); }
      // sliced halves (phase glitch)
      const sl = Math.sin(T * 1.7 + i * 2) * 5 + 4;
      ctx.save(); ctx.beginPath(); ctx.rect(cx - ww, yy - size, ww * 2, size * 0.56 + 0); ctx.clip();
      ctx.fillStyle = g; ctx.fillText(wd[0], cx + sl, yy); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(cx - ww, yy - size * 0.44, ww * 2, size * 2); ctx.clip();
      ctx.fillStyle = g; ctx.fillText(wd[0], cx - sl * 0.5, yy); ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 1.5;
    });
  }
  function drawTitle() {
    ctx.fillStyle = "rgba(4,2,20,0.35)"; ctx.fillRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, 500); g.addColorStop(0, "rgba(4,2,20,0.65)"); g.addColorStop(1, "rgba(4,2,20,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, 500);
    logo(W / 2, 210, 100);
    txt(pl.world ? "TWO WORLDS  -  ONE ROAD" : "TWO WORLDS  -  ONE ROAD", W / 2, 400, 18, "rgba(255,255,255,0.85)", "center", 700);
    const a = 0.65 + 0.35 * Math.sin(T * 4);
    ctx.globalAlpha = a; drawPill(W / 2 - 150, 610, 300, 66, "rgba(255,255,255,0.12)", "#fff"); txt(tutSeen ? "TAP TO START" : "TAP TO PLAY", W / 2, 644, 30, "#fff", "center", 900, pl.world ? "#29f0ff" : "#ff9a3d"); ctx.globalAlpha = 1;
    txt("BEST  " + best, W / 2, 720, 24, "rgba(255,255,255,0.85)", "center", 800);
    txt("TAP = swap worlds     SWIPE = change lane", W / 2, 900, 16, "rgba(255,255,255,0.7)", "center", 600);
  }
  function drawTutorial() {
    ctx.fillStyle = "rgba(4,2,20,0.78)"; ctx.fillRect(0, 0, W, H);
    txt("HOW TO PHASE", W / 2, 120, 44, "#fff", "center", 900, pl.world ? "#29f0ff" : "#ff9a3d");
    const items = [
      ["TAP anywhere", "Swap between DAY and NIGHT", 0],
      ["SWIPE left / right", "Change lane (or use A / D)", 1],
      ["SOLID = your world", "Dashed ghosts only exist in the other one", 2],
      ["PHASE COINS", "Grab coins right after a swap for x2, x3, x4...", 3]
    ];
    items.forEach((it, i) => {
      const y = 210 + i * 130;
      rr(30, y - 50, W - 60, 108, 22); ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 2; ctx.stroke();
      const ix = 92; ctx.save(); ctx.translate(ix, y + 4);
      if (it[2] === 0) { const t = (T * 1.2) % 1; ctx.strokeStyle = t < 0.5 ? "#ffb020" : "#29f0ff"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 14 + t * 28, 0, 6.283); ctx.globalAlpha = 1 - t; ctx.stroke(); ctx.globalAlpha = 1; ctx.fillStyle = Math.floor(T * 1.2 * 2) % 2 ? "#29f0ff" : "#ffb020"; ctx.beginPath(); ctx.arc(0, 0, 12, 0, 6.283); ctx.fill(); }
      else if (it[2] === 1) { const o = Math.sin(T * 3) * 18; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(o, 0, 14, 0, 6.283); ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(-24, -8); ctx.moveTo(-34, 0); ctx.lineTo(-24, 8); ctx.moveTo(34, 0); ctx.lineTo(24, -8); ctx.moveTo(34, 0); ctx.lineTo(24, 8); ctx.stroke(); }
      else if (it[2] === 2) { drawBlock(-14, 34, 0.5, 0, false, 1); drawBlock(24, 34, 0.5, 1, true, 1); }
      else { drawCoin(0, 40, 1, true); }
      ctx.restore();
      txt(it[0], 150, y - 12, 26, "#fff", "left", 900); ctx.font = "600 16px " + FONT; txt(it[1], 150, y + 24, 16, "rgba(255,255,255,0.8)", "left", 600);
    });
    const a = 0.65 + 0.35 * Math.sin(T * 4);
    ctx.globalAlpha = a; drawPill(W / 2 - 130, 790, 260, 62, "rgba(255,255,255,0.15)", "#fff"); txt("TAP TO RUN", W / 2, 821, 28, "#fff", "center", 900); ctx.globalAlpha = 1;
  }
  function drawOver() {
    const k = clamp(overT / 0.45, 0, 1), e = 1 - Math.pow(1 - k, 3);
    ctx.fillStyle = "rgba(4,2,20," + 0.6 * e + ")"; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(0, (1 - e) * 60); ctx.globalAlpha = e;
    txt("PHASE LOST", W / 2, 200, 58, "#fff", "center", 900, "#ff3d7a");
    rr(50, 270, W - 100, 330, 28); ctx.fillStyle = "rgba(12,8,40,0.8)"; ctx.fill(); ctx.strokeStyle = pl.world ? "#29f0ff" : "#ffb020"; ctx.lineWidth = 3; ctx.stroke();
    txt("SCORE", W / 2, 312, 18, "rgba(255,255,255,0.7)", "center", 800);
    txt(String(totalScore()), W / 2, 380, 92, "#fff", "center", 900, pl.world ? "#29f0ff" : "#ff9a3d");
    if (newBest) { const s = 1 + Math.sin(T * 8) * 0.04; ctx.save(); ctx.translate(W / 2, 450); ctx.scale(s, s); drawPill(-90, -18, 180, 36, "#ffd23a"); txt("NEW BEST!", 0, 1, 20, "#3a1a00", "center", 900); ctx.restore(); }
    else txt("BEST  " + best, W / 2, 450, 24, "rgba(255,255,255,0.85)", "center", 800);
    txt(coins + " coins", W / 2 - 100, 530, 22, "#ffd23a", "center", 800); txt(Math.floor(D / 10) + " m", W / 2 + 100, 530, 22, "#fff", "center", 800);
    txt("PHASE STREAK " + streak, W / 2, 570, 15, "rgba(255,255,255,0.6)", "center", 700);
    if (overT > 0.7) { const a = 0.65 + 0.35 * Math.sin(T * 4); ctx.globalAlpha = a; drawPill(W / 2 - 150, 660, 300, 66, "rgba(255,255,255,0.14)", "#fff"); txt("TAP TO RETRY", W / 2, 694, 30, "#fff", "center", 900); }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  // ---------- frame ----------
  function draw() {
    ctx.setTransform(c.width / W, 0, 0, c.height / H, 0, 0);
    ctx.save();
    const sh = shake;
    ctx.translate(rnd(-sh, sh) * 0.5, rnd(-sh, sh) * 0.5);
    ctx.translate(W / 2, 700); ctx.rotate(bank * 0.018 + pl.vx * 0.0006 * 0 + (Math.random() - 0.5) * sh * 0.002); ctx.scale(1.03, 1.03); ctx.translate(-W / 2, -700);
    drawSky(); drawGround(); drawBuildings();
    drawSpeedLines();
    drawRowsPass(true);
    if (state !== "over" && !(state === "dying" && overT > 0.05)) {
      if (state === "title" || state === "tutorial" || state === "play" || state === "dying") drawPlayer(1);
    }
    drawRowsPass(false);
    drawParticles();
    // hurt vignette / flash
    if (hurtFx > 0) { const g = ctx.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 700); g.addColorStop(0, "rgba(255,30,80,0)"); g.addColorStop(1, "rgba(255,30,80," + 0.6 * hurtFx + ")"); ctx.fillStyle = g; ctx.fillRect(-50, -50, W + 100, H + 100); }
    if (slowT > 0) { const g = ctx.createRadialGradient(W / 2, H / 2, 250, W / 2, H / 2, 700); g.addColorStop(0, "rgba(160,110,255,0)"); g.addColorStop(1, "rgba(160,110,255,0.35)"); ctx.fillStyle = g; ctx.fillRect(-50, -50, W + 100, H + 100); }
    if (flash > 0) { ctx.fillStyle = "rgba(255,255,255," + 0.45 * flash + ")"; ctx.fillRect(-50, -50, W + 100, H + 100); }
    ctx.restore();
    chroma();
    ctx.setTransform(c.width / W, 0, 0, c.height / H, 0, 0);
    if (state === "play" || state === "dying") drawHUD();
    else drawMute();
    if (state === "title") drawTitle();
    else if (state === "tutorial") drawTutorial();
    else if (state === "over") drawOver();
  }

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000; last = now;
    if (paused) return;
    dt = clamp(dt, 0, 0.05);
    update(dt); musicTick(); draw();
  }
  requestAnimationFrame(frame);

  // test hook (read-only snapshot + power grant)
  window.__PR = {
    snap() {
      return {
        state, D, speed, runT, score: totalScore(), coins, streak, shield, magnetT, slowT, lane: pl.lane, x: pl.x, world: pl.world, best, firstRun,
        rows: rows.filter((r) => r.z - D > -70 && r.z - D < 2200).map((r) => ({ rel: r.z - D, str: r.str, items: r.items.filter((i) => !i.taken).map((i) => ({ k: i.k, lane: i.lane, world: i.world })) }))
      };
    },
    grant(t) { if (t === "shield") shield = true; if (t === "magnet") magnetT = 8; if (t === "slow") slowT = 4; }
  };
})();
