// Chain Bloom - one tap, one bloom. Rendering, audio, UI. Simulation lives in sim.js.
(() => {
  "use strict";
  const CB = window.CB, W = CB.W, H = CB.H, TICK = CB.TICK, TY = CB.TY;
  const c = document.getElementById("c");
  const ctx = c.getContext("2d");
  const FONT = '"Trebuchet MS","Segoe UI","Avenir Next",system-ui,sans-serif';
  const LEVELS = 40, PER_PACK = 10;
  const TAU = Math.PI * 2;

  // ---------- storage ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  let prog = { levels: {} };
  try { const p = JSON.parse(store.get("chainbloom.progress") || "null"); if (p && p.levels) prog = p; } catch (e) {}
  function saveProg() {
    store.set("chainbloom.progress", JSON.stringify(prog));
    if (window.Arcadia && Arcadia.save) { try { Arcadia.save(prog); } catch (e) {} }
  }
  const stars = (i) => (prog.levels[i] ? prog.levels[i].s : 0);
  const unlocked = (i) => i === 0 || stars(i - 1) > 0;
  const totalScore = () => Object.values(prog.levels).reduce((a, b) => a + (b.sc || 0), 0);
  const totalStars = () => Object.values(prog.levels).reduce((a, b) => a + (b.s || 0), 0);
  let bestZen = Number(store.get("chainbloom.best") || 0);
  let muted = store.get("chainbloom.muted") === "1";

  // ---------- view ----------
  let view = { s: 1, ox: 0, oy: 0, dpr: 1, cw: 0, ch: 0 }, bgCanvas = null;
  function fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), iw = innerWidth, ih = innerHeight;
    const s = Math.min(iw / W, ih / H);
    view = { s, ox: (iw - W * s) / 2, oy: (ih - H * s) / 2, dpr, cw: iw, ch: ih };
    c.style.width = iw + "px"; c.style.height = ih + "px";
    c.width = Math.round(iw * dpr); c.height = Math.round(ih * dpr);
    buildBg();
  }
  function applyView() { ctx.setTransform(view.s * view.dpr, 0, 0, view.s * view.dpr, view.ox * view.dpr, view.oy * view.dpr); }
  const ext = () => ({ l: -view.ox / view.s, r: W + view.ox / view.s, t: -view.oy / view.s, b: H + view.oy / view.s });

  // ---------- sprites ----------
  const glowCache = {};
  function glow(h, s = 100, l = 60) {
    const k = h + "_" + s + "_" + l;
    if (glowCache[k]) return glowCache[k];
    const cv = document.createElement("canvas"); cv.width = cv.height = 64;
    const g = cv.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `hsla(${h},${s}%,${l + 15}%,1)`); gr.addColorStop(0.35, `hsla(${h},${s}%,${l}%,.45)`); gr.addColorStop(1, `hsla(${h},${s}%,${l}%,0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (glowCache[k] = cv);
  }
  function drawGlow(x, y, r, h, a, s, l) { ctx.globalAlpha = a; ctx.drawImage(glow(Math.round(h / 6) * 6, s, l), x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1; }
  const mistSprite = (() => {
    const cv = document.createElement("canvas"); cv.width = cv.height = 128;
    const g = cv.getContext("2d"), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(150,230,230,.55)"); gr.addColorStop(1, "rgba(150,230,230,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return cv;
  })();

  function buildBg() {
    bgCanvas = document.createElement("canvas");
    bgCanvas.width = c.width; bgCanvas.height = c.height;
    const g = bgCanvas.getContext("2d"), e = ext();
    g.setTransform(view.s * view.dpr, 0, 0, view.s * view.dpr, view.ox * view.dpr, view.oy * view.dpr);
    const gr = g.createLinearGradient(0, e.t, 0, e.b);
    gr.addColorStop(0, "#0b0f3a"); gr.addColorStop(0.35, "#0a2452"); gr.addColorStop(0.7, "#07404a"); gr.addColorStop(1, "#04182a");
    g.fillStyle = gr; g.fillRect(e.l, e.t, e.r - e.l, e.b - e.t);
    let rg = g.createRadialGradient(270, 520, 0, 270, 520, 520);
    rg.addColorStop(0, "rgba(20,200,190,.24)"); rg.addColorStop(0.6, "rgba(20,120,160,.10)"); rg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = rg; g.fillRect(e.l, e.t, e.r - e.l, e.b - e.t);
    // lily pads
    const r = CB.rng(77);
    for (let i = 0; i < 34; i++) {
      const x = e.l - 60 + r() * (e.r - e.l + 120), y = e.t - 60 + r() * (e.b - e.t + 120), rad = 26 + r() * 52, an = r() * TAU;
      // keep the pond centre clearer
      if (x > 90 && x < 450 && y > 170 && y < 830 && r() < 0.85) continue;
      g.save(); g.translate(x, y); g.rotate(an);
      const pg = g.createRadialGradient(0, 0, 0, 0, 0, rad);
      pg.addColorStop(0, "rgba(16,92,86,.85)"); pg.addColorStop(1, "rgba(8,48,58,.85)");
      g.fillStyle = pg; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, rad, 0.22, TAU - 0.22); g.closePath(); g.fill();
      g.strokeStyle = "rgba(120,255,225,.16)"; g.lineWidth = 1.5; g.stroke();
      g.strokeStyle = "rgba(120,255,225,.08)"; g.beginPath();
      for (let k = 0; k < 6; k++) { const a = 0.6 + k * 0.95; g.moveTo(0, 0); g.lineTo(Math.cos(a) * rad * 0.9, Math.sin(a) * rad * 0.9); }
      g.stroke(); g.restore();
      if (r() < 0.22) { g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.55; g.drawImage(glow(320, 90, 62), x - 30, y - 30, 60, 60); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; }
    }
    // vignette
    rg = g.createRadialGradient(270, 480, 300, 270, 480, Math.max(900, (e.r - e.l) * 0.8));
    rg.addColorStop(0, "rgba(2,6,20,0)"); rg.addColorStop(1, "rgba(2,6,20,.72)");
    g.fillStyle = rg; g.fillRect(e.l, e.t, e.r - e.l, e.b - e.t);
  }

  // ---------- audio ----------
  const AU = { ctx: null };
  const PENT = [0, 2, 4, 7, 9];
  function noteFreq(i) {
    let j = i % 32; if (j > 16) j = 32 - j;
    return 261.63 * Math.pow(2, (PENT[j % 5] + 12 * Math.floor(j / 5)) / 12);
  }
  function auInit() {
    try {
      if (AU.ctx) { if (AU.ctx.state === "suspended") AU.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const a = new AC(); AU.ctx = a; AU.voices = 0;
      const master = a.createGain(); master.gain.value = muted ? 0 : 0.85;
      const comp = a.createDynamicsCompressor(); master.connect(comp); comp.connect(a.destination);
      const verb = a.createConvolver(), len = Math.floor(a.sampleRate * 2.2), ir = a.createBuffer(2, len, a.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
      verb.buffer = ir; const wet = a.createGain(); wet.gain.value = 0.34; verb.connect(wet); wet.connect(master);
      AU.master = master; AU.verb = verb;
      const nl = a.sampleRate, nb = a.createBuffer(1, nl, a.sampleRate), nd = nb.getChannelData(0);
      for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;
      AU.noise = nb;
      [65.41, 98, 130.8].forEach((f, i) => {
        const o = a.createOscillator(), g = a.createGain(); o.type = "sine"; o.frequency.value = f; g.gain.value = 0.018 - i * 0.004;
        o.connect(g); g.connect(master); o.start();
      });
    } catch (e) {}
  }
  function tone(f, t0, dur, vol, type, send, slideTo) {
    const a = AU.ctx; if (!a || AU.voices > 40) return;
    try {
      const o = a.createOscillator(), g = a.createGain(); o.type = type || "sine";
      o.frequency.setValueAtTime(f, t0); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(AU.master); if (send !== 0) { const s = a.createGain(); s.gain.value = send == null ? 0.6 : send; g.connect(s); s.connect(AU.verb); }
      AU.voices++; o.onended = () => AU.voices--; o.start(t0); o.stop(t0 + dur + 0.05);
    } catch (e) {}
  }
  function thud(t0, dur, vol, freq) {
    const a = AU.ctx; if (!a) return;
    try {
      const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); s.buffer = AU.noise; f.type = "lowpass"; f.frequency.value = freq || 300;
      g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); s.connect(f); f.connect(g); g.connect(AU.master); s.start(t0); s.stop(t0 + dur);
    } catch (e) {}
  }
  let auStagger = 0, auLast = 0;
  function sfx(name, note, type) {
    const a = AU.ctx; if (!a || muted) return;
    const now = a.currentTime; if (now - auLast > 0.05) auStagger = 0; auLast = now;
    const t = now + 0.005 + auStagger; auStagger += 0.028;
    switch (name) {
      case "bloom": {
        const f = noteFreq(note);
        tone(f, t, 1.4, 0.15, "sine"); tone(f * 2, t, 0.6, 0.05, "triangle"); tone(f * 4.01, t, 0.25, 0.018, "sine", 0.3);
        if (type === "p") tone(f / 2, t, 1.6, 0.2, "sine");
        if (type === "i") { tone(f * 4, t, 0.9, 0.05, "triangle"); tone(f * 6, t + 0.05, 0.6, 0.03, "sine"); }
        if (type === "m") tone(f * 0.5, t, 0.8, 0.12, "triangle");
        if (type === "b") { thud(t, 0.9, 0.7, 180); tone(f / 2, t, 1.5, 0.22, "sine"); }
        break;
      }
      case "seed": { const f = noteFreq(note); tone(f * 2, t, 0.5, 0.08, "triangle"); break; }
      case "spark": tone(330, t, 0.35, 0.14, "sine", 0.6, 990); tone(660, t, 0.4, 0.06, "triangle"); break;
      case "thorn": tone(110, t, 0.35, 0.16, "sawtooth", 0.2, 55); thud(t, 0.3, 0.35, 500); break;
      case "dud": thud(t, 0.4, 0.5, 220); tone(90, t, 0.4, 0.14, "sine", 0.2, 45); break;
      case "freeze": tone(2200, t, 0.5, 0.05, "sine"); tone(3300, t + 0.04, 0.4, 0.03, "sine"); break;
      case "charge": tone(160, t, 0.6, 0.1, "triangle", 0.3, 480); break;
      case "goal": [0, 4, 7].forEach((s, i) => tone(523.25 * Math.pow(2, s / 12), t + i * 0.07, 0.9, 0.09, "triangle")); break;
      case "win": [0, 2, 4, 7, 9, 12].forEach((s, i) => tone(261.63 * Math.pow(2, s / 12), t + i * 0.09, 1.6, 0.13, "sine")); break;
      case "star": tone(523.25 * Math.pow(2, note / 12), t, 1.2, 0.14, "triangle"); tone(1046.5 * Math.pow(2, note / 12), t, 0.6, 0.05, "sine"); break;
      case "fail": [7, 3, 0, -5].forEach((s, i) => tone(261.63 * Math.pow(2, s / 12), t + i * 0.16, 1.2, 0.12, "sine")); break;
      case "ui": tone(880, t, 0.18, 0.08, "sine", 0.3); break;
    }
  }
  function setMuted(m) {
    muted = m; store.set("chainbloom.muted", m ? "1" : "0");
    if (AU.master) AU.master.gain.value = m ? 0 : 0.85;
  }

  // ---------- state ----------
  let state = "title", G = null, paused = false, T = 0, mouse = null, shake = 0, flash = 0;
  const ui = { btns: [], press: {} };
  const levelCache = {};
  function getLevel(i) { return levelCache[i] || (levelCache[i] = CB.genLevel(i)); }
  const rampHue = (d) => (190 + d * 26) % 360;
  const ramp = (d, l = 62, s = 95, a = 1) => `hsla(${rampHue(d)},${s}%,${l}%,${a})`;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  // visual systems
  let parts = [], ripples = [], texts = [], mist = [], pollen = [];
  { const r = CB.rng(5);
    for (let i = 0; i < 9; i++) mist.push({ x: r() * 900 - 180, y: r() * 1100 - 70, s: 260 + r() * 300, v: (4 + r() * 10) * (r() < 0.5 ? -1 : 1), a: 0.05 + r() * 0.06, layer: i % 3 });
    for (let i = 0; i < 46; i++) pollen.push({ x: r() * 540, y: r() * 960, v: 6 + r() * 14, ph: r() * TAU, s: 0.8 + r() * 1.8 }); }
  function ripple(x, y, h, maxR, life) { ripples.push({ x, y, h, maxR, t: 0, life: life || 1.6 }); if (ripples.length > 60) ripples.shift(); }
  function petals(x, y, h, n, spd) {
    for (let i = 0; i < n && parts.length < 420; i++) {
      const a = Math.random() * TAU, v = (0.4 + Math.random()) * spd;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 8, t: 0, life: 0.9 + Math.random() * 0.9, size: 5 + Math.random() * 6, h: h + (Math.random() - 0.5) * 30 });
    }
  }
  function floatText(x, y, s, h, size) { texts.push({ x, y, s, h, t: 0, size: size || 16 }); if (texts.length > 40) texts.shift(); }

  // ---------- game flow ----------
  function goto(s) { state = s; ui.btns = []; }
  function newPlay(mode, idx, level) {
    const w = CB.makeWorld(level);
    const prev = G && G.mode === mode && G.idx === idx ? G : null;
    G = Object.assign(G && mode === "zen" && G.mode === "zen" ? { zen: G.zen } : {}, {
      mode, idx, level, world: w, phase: "ready", ts: 1, slowT: 0, finale: 0, combo: { chain: 0, mult: 1, pop: 0, best: 0 }, fails: prev ? prev.fails : 0,
      tipT: 0, res: null, resT: 0, showGoalPulse: 0, taps0: level.taps, scoreShown: 0,
    });
    parts = []; ripples = []; texts = [];
    goto("play");
  }
  function loadThen(fn) {
    state = "loading"; ui.btns = [];
    setTimeout(() => setTimeout(fn, 20), 20);
  }
  function startLevel(i) {
    if (levelCache[i]) { newPlay("campaign", i, levelCache[i]); return; }
    G = { mode: "campaign", idx: i }; loadThen(() => newPlay("campaign", i, getLevel(i)));
  }
  function dailySeed() { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
  function zenLevel(round) {
    const key = "z" + dailySeed() + "_" + round;
    return levelCache[key] || (levelCache[key] = CB.genLevel(200 + round, { e: Math.min(8 + round, 44), seed: CB.hash(dailySeed(), round + 1), oneTap: true }));
  }
  function startZen() {
    G = { mode: "zen", zen: { round: 0, lives: 3, total: 0, cleared: 0 } };
    loadThen(() => newPlay("zen", 0, zenLevel(0)));
  }
  function zenNext() {
    const z = G.zen; G = { mode: "zen", zen: z };
    loadThen(() => newPlay("zen", z.round, zenLevel(z.round)));
  }
  function retry() {
    if (state !== "play" || !G || !G.level) return;
    if (G.mode === "zen" && G.phase === "result" && G.res && !G.res.win) { zenAfterFail(); return; }
    if (G.mode === "zen" && G.phase === "result" && G.res && G.res.win) { zenNext(); return; }
    if (G.mode === "zen" && G.phase !== "ready" && G.phase !== "result") { /* zen: no free retry mid-round */ return; }
    if (G.mode === "zen" && G.phase === "ready") { const l = G.level; newPlay("zen", G.idx, l); return; }
    const fails = G.fails; newPlay(G.mode, G.idx, G.level); G.fails = fails;
  }
  function zenAfterFail() {
    const z = G.zen;
    if (z.lives <= 0) { zenOver(); return; }
    zenNext();
  }
  function zenOver() {
    const z = G.zen;
    if (z.total > bestZen) { bestZen = z.total; store.set("chainbloom.best", String(bestZen)); }
    if (window.Arcadia) { try { Arcadia.submitScore(z.total); Arcadia.gameOver && Arcadia.gameOver(); } catch (e) {} }
    G.phase = "zenover"; goto("zenover");
  }
  function nextLevel() {
    if (G.idx + 1 < LEVELS) startLevel(G.idx + 1); else { goto("map"); mapPage = PACK_LAST; }
  }
  const PACK_LAST = LEVELS / PER_PACK - 1;
  let mapPage = 0;

  function finishRound() {
    const w = G.world, L = G.level, win = w.count >= L.goal;
    const st = win ? 1 + (w.count >= L.s2 ? 1 : 0) + (w.count >= L.s3 ? 1 : 0) : 0;
    const bonus = win ? w.tapsLeft * 250 + st * 300 : 0;
    const score = w.score + bonus;
    G.res = { win, stars: st, score, base: w.score, bonus, count: w.count, maxChain: w.maxChain };
    G.phase = "result"; G.resT = 0; G.starShown = 0;
    if (G.mode === "campaign") {
      if (win) {
        const old = prog.levels[G.idx];
        G.res.newBest = !old || score > old.sc;
        prog.levels[G.idx] = { s: Math.max(st, old ? old.s : 0), sc: Math.max(score, old ? old.sc : 0) };
        saveProg();
        if ((G.idx + 1) % PER_PACK === 0 || G.idx === LEVELS - 1) if (window.Arcadia) { try { Arcadia.submitScore(totalScore()); } catch (e) {} }
      } else G.fails++;
    } else {
      const z = G.zen;
      if (win) { z.total += score; z.round++; z.cleared++; } else z.lives--;
      if (z.total > bestZen) { bestZen = z.total; store.set("chainbloom.best", String(bestZen)); }
    }
    sfx(win ? "win" : "fail");
    if (!win) shake = 0;
    if (win) flash = 0.5;
  }

  // ---------- input ----------
  function toLogical(e) { return { x: (e.clientX - view.ox) / view.s, y: (e.clientY - view.oy) / view.s }; }
  function hitBtn(p) { for (let i = ui.btns.length - 1; i >= 0; i--) { const b = ui.btns[i]; if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b; } return null; }
  let swipe = null;
  c.addEventListener("pointerdown", (e) => {
    e.preventDefault(); auInit();
    const p = toLogical(e); mouse = p;
    const b = hitBtn(p);
    if (b) { ui.press[b.id] = 0.15; sfx("ui"); b.fn(); return; }
    swipe = { x: p.x, y: p.y };
    if (state === "play" && G && G.phase === "ready" && G.world.tapsLeft > 0) {
      plant(clamp(p.x, 30, W - 30), clamp(p.y, 150, 900));
    }
    if (state === "title" && !b) { /* taps on title do nothing except audio init */ }
  });
  c.addEventListener("pointermove", (e) => { mouse = toLogical(e); });
  addEventListener("pointerup", (e) => {
    if (swipe && state === "map") {
      const p = toLogical(e), dx = p.x - swipe.x;
      if (Math.abs(dx) > 70) mapPage = clamp(mapPage + (dx < 0 ? 1 : -1), 0, PACK_LAST);
    }
    swipe = null;
  });
  c.addEventListener("contextmenu", (e) => e.preventDefault());
  addEventListener("keydown", (e) => {
    auInit();
    const k = e.key;
    if (k === "m" || k === "M") { setMuted(!muted); return; }
    if (k === " " || k === "r" || k === "R") { e.preventDefault(); if (state === "play") retry(); else if (state === "title") goto("map"); return; }
    if (k === "Enter") {
      if (state === "title") goto("map");
      else if (state === "play" && G.phase === "result" && G.res.win) { G.mode === "zen" ? zenNext() : nextLevel(); }
      else if (state === "zenover") startZen();
    }
    if (k === "Escape") { if (state === "play") exitPlay(); else if (state === "map" || state === "zenover") goto("title"); }
  });
  function exitPlay() { if (G && G.mode === "zen" && G.zen.cleared + (G.zen.lives < 3 ? 1 : 0) > 0) { zenOver(); return; } if (G && G.mode === "campaign") mapPage = Math.floor(G.idx / PER_PACK); goto(G && G.mode === "zen" ? "title" : "map"); }
  if (window.Arcadia) { try { Arcadia.onPause(() => (paused = true)); Arcadia.onResume(() => (paused = false)); } catch (e) {} }
  document.addEventListener("visibilitychange", () => { if (document.hidden) paused = true; else if (!window.Arcadia) paused = false; });
  addEventListener("blur", () => { if (!window.Arcadia) paused = true; });
  addEventListener("focus", () => { paused = false; });

  function plant(x, y) {
    const w = G.world;
    if (CB.tap(w, x, y)) { G.phase = "chain"; G.tipT = 1; }
  }

  // ---------- update ----------
  function handleEvents(w) {
    for (const e of w.events) {
      switch (e.k) {
        case "spark": ripple(e.x, e.y, 190, 130, 1.4); petals(e.x, e.y, 190, 10, 120); sfx("spark"); break;
        case "bloom": {
          const h = rampHue(e.depth);
          petals(e.x, e.y, h, e.type === "p" || e.type === "b" ? 22 : 9, e.type === "p" ? 190 : 120);
          ripple(e.x, e.y, h, TY[e.type].R * 1.5, 1.7);
          floatText(e.x, e.y - 14, "+" + fmt(e.pts), h, e.chain > 10 ? 20 : 16);
          G.combo.chain = e.chain; G.combo.mult = e.mult; G.combo.pop = 1; G.combo.best = Math.max(G.combo.best, e.chain);
          sfx("bloom", e.note, e.type);
          if (e.type === "p" || e.type === "b") shake = Math.max(shake, 5);
          break;
        }
        case "seed": {
          const h = rampHue(e.depth); petals(e.x, e.y, h, 6, 90); ripple(e.x, e.y, h, 90, 1.2);
          floatText(e.x, e.y - 10, "+" + fmt(e.pts), h, 14); G.combo.chain = e.chain; G.combo.mult = e.mult; G.combo.pop = 1;
          sfx("seed", e.note); break;
        }
        case "thorn": petals(e.x, e.y, 290, 12, 130); ripple(e.x, e.y, 300, 70, 1); floatText(e.x, e.y - 12, "COMBO BROKEN", 330, 15); G.combo.chain = 0; G.combo.mult = 1; G.combo.pop = 1; sfx("thorn"); shake = Math.max(shake, 4); G.hitstop = 0.09; break;
        case "dud": petals(e.x, e.y, 20, 10, 90); ripple(e.x, e.y, 20, 60, 1); floatText(e.x, e.y - 12, "FIZZLED", 20, 15); G.combo.chain = 0; G.combo.mult = 1; G.combo.pop = 1; sfx("dud"); break;
        case "boom": shake = 9; flash = Math.max(flash, 0.25); floatText(e.x, e.y - 30, "DETONATED!", 45, 22); break;
        case "freeze": sfx("freeze"); ripple(e.x, e.y, 200, 50, 1); break;
        case "charge": sfx("charge"); ripple(e.x, e.y, 320, 100, 1); break;
        case "goal": G.showGoalPulse = 1; sfx("goal"); floatText(W / 2, 200, "GOAL REACHED", 140, 22); break;
      }
    }
    w.events.length = 0;
  }
  function stepWorld(dt) {
    const w = G.world;
    let scale = G.ts;
    const active = w.blooms.length + w.seeds.length;
    let target = active >= 6 ? 0.55 - Math.min(0.2, (active - 6) * 0.03) : 1;
    if (G.phase === "finale") target = 0.5;
    G.ts += (target - G.ts) * Math.min(1, dt * 6);
    if (G.hitstop > 0) { G.hitstop -= dt; scale = 0.1; }
    G.acc = (G.acc || 0) + dt * scale;
    let n = 0;
    while (G.acc >= TICK && n < 8) { G.acc -= TICK; CB.step(w); n++; }
    handleEvents(w);
  }
  function update(dt) {
    T += dt;
    shake = Math.max(0, shake - dt * 22); flash = Math.max(0, flash - dt * 1.4);
    for (const k in ui.press) { ui.press[k] -= dt; if (ui.press[k] <= 0) delete ui.press[k]; }
    // ambient visuals always
    for (const p of parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 1.6; p.vy *= 1 - dt * 1.6; p.rot += p.vr * dt; }
    parts = parts.filter((p) => p.t < p.life);
    for (const r of ripples) r.t += dt; ripples = ripples.filter((r) => r.t < r.life);
    for (const t of texts) t.t += dt; texts = texts.filter((t) => t.t < 1.3);
    for (const m of mist) { m.x += m.v * dt * (0.5 + m.layer * 0.5); if (m.x > 720) m.x = -260; if (m.x < -260) m.x = 720; }
    for (const p of pollen) { p.y -= p.v * dt; if (p.y < -10) { p.y = 970; p.x = Math.random() * 540; } }
    if (state === "title") updateAttract(dt);
    if (state !== "play" || !G || !G.world) return;
    const w = G.world;
    G.combo.pop = Math.max(0, G.combo.pop - dt * 4);
    G.showGoalPulse = Math.max(0, G.showGoalPulse - dt * 1.5);
    G.tipT = Math.max(0, G.tipT - dt * 0.9);
    G.scoreShown += (w.score - G.scoreShown) * Math.min(1, dt * 8);
    if (G.phase === "ready" || G.phase === "chain" || G.phase === "finale") stepWorld(dt);
    else if (G.phase === "result") { G.ts = 1; G.acc = (G.acc || 0) + dt; let n = 0; while (G.acc >= TICK && n < 4) { G.acc -= TICK; CB.step(w); n++; } w.events.length = 0; }
    if (G.phase === "chain" && CB.isSettled(w)) {
      if (w.count >= G.level.goal || w.tapsLeft <= 0) { G.phase = "finale"; G.finale = 0.9; }
      else G.phase = "ready";
    }
    if (G.phase === "finale") { G.finale -= dt; if (G.finale <= 0) finishRound(); }
    if (G.phase === "result") {
      const prev = G.resT; G.resT += dt;
      if (G.res.win) {
        for (let s = 1; s <= G.res.stars; s++) if (prev < 0.5 + s * 0.4 && G.resT >= 0.5 + s * 0.4) { sfx("star", s * 2 + 2); petals(W / 2 + (s - 2) * 100, 405, 45, 14, 160); }
        if (G.mode === "campaign" && G.resT > 2.4 && !G.pref && G.idx + 1 < LEVELS && !levelCache[G.idx + 1]) { G.pref = true; setTimeout(() => getLevel(G.idx + 1), 30); }
      }
    }
  }

  // attract mode (title background)
  let att = null;
  function updateAttract(dt) {
    if (!att || att.reset) {
      const seed = att ? att.seed + 1 : 3;
      const lvl = { index: 0, taps: 1, goal: 999, crystals: CB.genLevel ? attractLayout(seed) : [] };
      att = { world: CB.makeWorld(lvl), seed, t: 0, tapped: false, acc: 0, settledT: 0 };
    }
    const w = att.world; att.t += dt;
    if (!att.tapped && att.t > 2.2) {
      let best = null, bs = -1;
      for (const cr of w.crystals) {
        let n = 0; for (const o of w.crystals) if (Math.hypot(o.x - cr.x, o.y - cr.y) < 140) n++;
        if (n > bs) { bs = n; best = cr; }
      }
      CB.tap(w, best.x + 6, best.y + 4); att.tapped = true; playAttractEvents.on = true;
    }
    att.acc += dt * (w.blooms.length > 5 ? 0.6 : 1);
    let n = 0; while (att.acc >= TICK && n < 6) { att.acc -= TICK; CB.step(w); n++; }
    for (const e of w.events) attractEvent(e);
    w.events.length = 0;
    if (att.tapped && CB.isSettled(w)) { att.settledT += dt; if (att.settledT > 2.2) att.reset = true; }
  }
  const playAttractEvents = { on: false };
  function attractEvent(e) {
    if (e.k === "bloom") { const h = rampHue(e.depth); petals(e.x, e.y, h, 7, 110); ripple(e.x, e.y, h, TY[e.type].R * 1.4, 1.6); if (AU.ctx && !muted) sfx("bloom", e.note, e.type); }
    if (e.k === "spark") { ripple(e.x, e.y, 190, 120, 1.4); }
  }
  function attractLayout(seed) {
    const r = CB.rng(seed * 991), out = [];
    for (let i = 0, tries = 0; i < 26 && tries < 900; tries++) {
      const x = 40 + r() * 460, y = 60 + r() * 850;
      if (out.some((o) => Math.hypot(o.ax - x, o.ay - y) < 62)) continue;
      if (x > 40 && x < 500 && ((y > 110 && y < 540) || (y > 585 && y < 790))) continue; // keep logo and buttons airy
      const type = r() < 0.12 ? "p" : "n"; i++;
      out.push({ type, ax: x, ay: y, Ax: 8 + r() * 10, Ay: 8 + r() * 10, wx: 0.3 + r() * 0.4, wy: 0.3 + r() * 0.4, px: r() * TAU, py: r() * TAU, hue: 178 + Math.floor(r() * 120), rot: r() * TAU });
    }
    return out;
  }

  // ---------- drawing primitives ----------
  function rr(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function text(s, x, y, size, col, align, weight, glowCol, spacing) {
    ctx.font = `${weight || "700"} ${size}px ${FONT}`; ctx.textAlign = align || "center"; ctx.textBaseline = "middle";
    try { ctx.letterSpacing = (spacing || 0) + "px"; } catch (e) {}
    if (glowCol) { ctx.shadowColor = glowCol; ctx.shadowBlur = 14; }
    ctx.fillStyle = col || "#fff"; ctx.fillText(s, x, y);
    ctx.shadowBlur = 0; try { ctx.letterSpacing = "0px"; } catch (e) {}
  }
  function facet(len, wid, cl, cr) {
    ctx.fillStyle = cl; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-wid, -len * 0.42); ctx.lineTo(0, -len); ctx.closePath(); ctx.fill();
    ctx.fillStyle = cr; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(wid, -len * 0.42); ctx.lineTo(0, -len); ctx.closePath(); ctx.fill();
  }
  function flower(x, y, n, len, wid, h, rot, s, l, alpha, inner) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = alpha;
    const step = TAU / n;
    for (let i = 0; i < n; i++) { facet(len, wid, `hsl(${h},${s}%,${l}%)`, `hsl(${h},${s}%,${l - 13}%)`); ctx.rotate(step); }
    if (inner) {
      ctx.rotate(step / 2);
      for (let i = 0; i < n; i++) { facet(len * 0.62, wid * 0.7, `hsl(${h},${s}%,${l + 20}%)`, `hsl(${h},${s}%,${l + 8}%)`); ctx.rotate(step); }
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }
  function star5(x, y, R, fill, stroke) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? R * 0.45 : R; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  }
  const TYPEHUE = { p: 46, m: 318, s: 142, i: 196, b: 18 };

  function drawCrystal(cr, w) {
    const T0 = TY[cr.type], r = T0.r, x = cr.x, y = cr.y, tt = T + cr.id * 0.7;
    if (cr.state === 3) {
      const age = w.time - cr.t0;
      if (age < 1.4 && cr.type !== "t") { ctx.globalAlpha = 1 - age / 1.4; ctx.fillStyle = "#2a1408"; ctx.beginPath(); ctx.arc(x, y, r * (1 + age * 0.6), 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      return;
    }
    if (cr.state === 2) {
      const age = w.time - cr.t0, op = 1 + Math.min(0.35, age * 1.2), a = Math.max(0.42, 1 - age * 0.5), h = rampHue(cr.depth);
      ctx.globalCompositeOperation = "lighter"; drawGlow(x, y, r * 3.6, h, 0.5 * a); ctx.globalCompositeOperation = "source-over";
      const n = cr.type === "p" ? 8 : cr.type === "i" ? 6 : 7;
      flower(x, y, n, r * 1.85 * op, r * 0.78 * op, h, cr.rot + age * 0.5, 90, 60, a, true);
      ctx.fillStyle = `rgba(255,255,255,${0.9 * a})`; ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, TAU); ctx.fill();
      return;
    }
    const pulse = 1 + Math.sin(tt * 2.2) * 0.04, rot = cr.rot + T * 0.15;
    const frozen = cr.state === 1;
    let sx = x, sy = y;
    if (frozen) { const k = 1 - cr.timer / cr.timer0; sx += Math.sin(T * 60) * k * 1.6; sy += Math.cos(T * 53) * k * 1.6; }
    const hue = TYPEHUE[cr.type] || cr.hue;
    if (cr.type === "t") {
      ctx.globalCompositeOperation = "lighter"; drawGlow(x, y, r * 3.2, 300, 0.45 + 0.15 * Math.sin(tt * 3), 90, 45); ctx.globalCompositeOperation = "source-over";
      ctx.save(); ctx.translate(x, y); ctx.rotate(-rot * 1.5);
      for (let i = 0; i < 9; i++) {
        ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(0, -r * (i % 2 ? 1.5 : 2.1)); ctx.lineTo(3, 0); ctx.closePath();
        ctx.fillStyle = "#12061e"; ctx.fill(); ctx.strokeStyle = "rgba(255,70,200,.85)"; ctx.lineWidth = 1.2; ctx.stroke(); ctx.rotate(TAU / 9);
      }
      ctx.restore();
      ctx.fillStyle = "#1c0a2c"; ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, TAU); ctx.fill(); ctx.strokeStyle = "rgba(255,80,210,.9)"; ctx.lineWidth = 1.5; ctx.stroke();
      return;
    }
    ctx.globalCompositeOperation = "lighter";
    drawGlow(x, y, r * 3.6, hue, 0.5 + 0.12 * Math.sin(tt * 2.4), cr.type === "i" ? 70 : 100, cr.type === "i" ? 72 : 60);
    ctx.globalCompositeOperation = "source-over";
    if (cr.type === "p" || cr.type === "i" || cr.type === "m") {
      ctx.strokeStyle = `hsla(${hue},80%,70%,${0.13 + 0.05 * Math.sin(T * 3)})`; ctx.lineWidth = 1.5; ctx.setLineDash([4, 9]); ctx.lineDashOffset = -T * 10;
      ctx.beginPath(); ctx.arc(x, y, cr.type === "m" ? T0.pullR * 0.55 : T0.R, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    switch (cr.type) {
      case "n": flower(sx, sy, 6, r * 1.7 * pulse, r * 0.72, cr.hue, rot, 80, 62, 1, true); break;
      case "p": flower(sx, sy, 8, r * 1.9 * pulse, r * 0.7, 46, rot, 95, 60, 1, true); break;
      case "m":
        flower(sx, sy, 5, r * 1.7 * pulse, r * 0.8, 318, rot, 85, 60, 1, true);
        ctx.strokeStyle = "rgba(255,150,240,.8)"; ctx.lineWidth = 2.2;
        for (let k = 0; k < 2; k++) { const a = T * 2.5 + k * Math.PI; ctx.beginPath(); ctx.arc(x, y, r * 2.05, a, a + 1.2); ctx.stroke(); }
        break;
      case "s":
        flower(sx, sy, 5, r * 1.6 * pulse, r * 0.75, 142, rot, 75, 60, 1, true);
        for (let k = 0; k < 3; k++) { const a = T * 1.6 + (k * TAU) / 3; ctx.fillStyle = "#c8ffd8"; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 2, y + Math.sin(a) * r * 2, 2.8, 0, TAU); ctx.fill(); }
        break;
      case "i": {
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(rot * 0.6);
        for (let i = 0; i < 6; i++) { facet(r * 2.05, r * 0.36, "hsl(196,75%,86%)", "hsl(200,70%,70%)"); ctx.save(); ctx.translate(0, -r * 1.2); ctx.rotate(0.7); facet(r * 0.7, r * 0.18, "#eafcff", "#a9dcf0"); ctx.rotate(-1.4); facet(r * 0.7, r * 0.18, "#eafcff", "#a9dcf0"); ctx.restore(); ctx.rotate(TAU / 6); }
        ctx.restore();
        if (frozen) {
          const k = 1 - cr.timer / cr.timer0;
          ctx.strokeStyle = "rgba(230,250,255,.95)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r * 2.3, -Math.PI / 2, -Math.PI / 2 + k * TAU); ctx.stroke();
          ctx.globalCompositeOperation = "lighter"; drawGlow(x, y, r * 5, 190, 0.5 * k); ctx.globalCompositeOperation = "source-over";
        }
        break;
      }
      case "b": {
        const chain = w.chain, ripe = chain >= CB.LATE, hb = ripe ? 46 + Math.sin(T * 10) * 4 : 16;
        flower(sx, sy, 8, r * 1.7 * pulse, r * 0.95, hb, rot * 0.5, 90, ripe ? 60 : 46, 1, true);
        ctx.fillStyle = "#2a0d08"; ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0, TAU); ctx.fill();
        ctx.strokeStyle = ripe ? "#ffe680" : "rgba(255,190,120,.85)"; ctx.lineWidth = 2.5; ctx.beginPath();
        ctx.arc(x, y, r * 0.62, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, chain / CB.LATE)); ctx.stroke();
        if (ripe) { ctx.globalCompositeOperation = "lighter"; drawGlow(x, y, r * 5, 45, 0.6 + 0.3 * Math.sin(T * 10)); ctx.globalCompositeOperation = "source-over"; }
        break;
      }
    }
    if (cr.type !== "b" && cr.type !== "i") { ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.beginPath(); ctx.arc(sx, sy, r * 0.28, 0, TAU); ctx.fill(); }
    if (cr.type === "m" && frozen) { ctx.strokeStyle = "rgba(255,160,240,.7)"; ctx.lineWidth = 2; const k = 1 - cr.timer / cr.timer0; ctx.beginPath(); ctx.arc(x, y, TY.m.pullR * (1 - k), 0, TAU); ctx.stroke(); }
  }
  function drawBloom(b) {
    if (b.rad <= 0 && !b.noTouch) return;
    const h = b.type === "k" ? 190 : rampHue(b.depth), fade = b.t > b.dur || b.noTouch ? clamp((b.end - b.t) / (b.noTouch ? 0.25 : CB.HOLD), 0, 1) : 1;
    const R = b.rad; if (R < 1) return;
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, R);
    g.addColorStop(0, `hsla(${h},100%,80%,${0.5 * fade})`); g.addColorStop(0.55, `hsla(${h},95%,58%,${0.13 * fade})`); g.addColorStop(1, `hsla(${h},95%,60%,${0.32 * fade})`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, TAU); ctx.fill();
    // petal rays
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.t * 0.7 + b.depth); ctx.globalAlpha = 0.5 * fade;
    const n = 12;
    for (let i = 0; i < n; i++) { ctx.rotate(TAU / n); facet(R * 0.98, R * 0.16, `hsl(${h},100%,68%)`, `hsl(${h},100%,52%)`); }
    ctx.rotate(TAU / n / 2); ctx.globalAlpha = 0.35 * fade;
    for (let i = 0; i < n; i++) { ctx.rotate(TAU / n); facet(R * 0.62, R * 0.12, `hsl(${h + 20},100%,85%)`, `hsl(${h + 20},100%,70%)`); }
    ctx.restore(); ctx.globalAlpha = 1;
    ctx.strokeStyle = `hsla(${h},100%,78%,${0.9 * fade})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, TAU); ctx.stroke();
    ctx.strokeStyle = `hsla(${h},100%,90%,${0.35 * fade})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(b.x, b.y, R * 0.86, 0, TAU); ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  }
  function drawFx() {
    ctx.globalCompositeOperation = "lighter";
    for (const r of ripples) {
      const k = r.t / r.life, rad = r.maxR * (0.2 + 0.8 * (1 - Math.pow(1 - k, 2)));
      ctx.strokeStyle = `hsla(${r.h},80%,70%,${0.32 * (1 - k)})`; ctx.lineWidth = 2 * (1 - k) + 0.5; ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, TAU); ctx.stroke();
      ctx.strokeStyle = `hsla(${r.h},80%,70%,${0.16 * (1 - k)})`; ctx.beginPath(); ctx.arc(r.x, r.y, rad * 0.72, 0, TAU); ctx.stroke();
    }
    for (const p of parts) {
      const k = p.t / p.life; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = 1 - k;
      facet(p.size * (1 - k * 0.4), p.size * 0.42, `hsl(${p.h},100%,72%)`, `hsl(${p.h},100%,58%)`); ctx.restore();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    for (const t of texts) {
      const k = t.t / 1.3; ctx.globalAlpha = 1 - k * k; text(t.s, t.x, t.y - k * 34, t.size, `hsl(${t.h},100%,80%)`, "center", "800", `hsl(${t.h},100%,50%)`); ctx.globalAlpha = 1;
    }
  }
  function drawWorld(w) {
    for (const cr of w.crystals) if (cr.state >= 2) drawCrystal(cr, w);
    for (const cr of w.crystals) if (cr.state < 2) drawCrystal(cr, w);
    for (const s of w.seeds) { ctx.globalCompositeOperation = "lighter"; drawGlow(s.x, s.y, 16, 140, 0.9); ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = "#e8fff0"; ctx.beginPath(); ctx.arc(s.x, s.y, 3.5, 0, TAU); ctx.fill(); }
    for (const b of w.blooms) drawBloom(b);
  }
  function drawBackdrop(dim) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(bgCanvas, 0, 0); applyView();
    ctx.globalCompositeOperation = "lighter";
    for (const m of mist) { ctx.globalAlpha = m.a * (m.layer === 2 ? 0.7 : 1); ctx.drawImage(mistSprite, m.x - m.s / 2, m.y - m.s / 2 + Math.sin(T * 0.2 + m.x) * 12, m.s, m.s * 0.7); }
    ctx.globalAlpha = 1;
    // caustics
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = `rgba(120,255,235,${0.035 + 0.02 * Math.sin(T * 0.7 + i)})`; ctx.beginPath();
      const y0 = 120 + i * 150;
      for (let x = -40; x <= 580; x += 20) { const y = y0 + Math.sin(x * 0.02 + T * 0.6 + i * 2) * 14 + Math.sin(x * 0.045 - T * 0.8 + i) * 6; x === -40 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
    }
    for (const p of pollen) { const a = 0.25 + 0.25 * Math.sin(T * 1.5 + p.ph); ctx.fillStyle = `rgba(180,255,240,${a})`; ctx.beginPath(); ctx.arc(p.x + Math.sin(T * 0.5 + p.ph) * 14, p.y, p.s, 0, TAU); ctx.fill(); }
    ctx.globalCompositeOperation = "source-over";
    if (dim) { ctx.fillStyle = `rgba(3,8,26,${dim})`; const e = ext(); ctx.fillRect(e.l, e.t, e.r - e.l, e.b - e.t); }
  }

  // ---------- UI widgets ----------
  function btn(id, x, y, w, h, fn, drawFn) {
    ui.btns.push({ id, x, y, w, h, fn });
    const pr = ui.press[id] ? 0.94 : 1;
    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.scale(pr, pr); ctx.translate(-w / 2, -h / 2); drawFn(w, h); ctx.restore();
  }
  function pill(label, primary, sub) {
    return (w, h) => {
      rr(0, 0, w, h, h / 2);
      if (primary) {
        const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#19d3c5"); g.addColorStop(1, "#7a5cff");
        ctx.shadowColor = "rgba(90,220,255,.55)"; ctx.shadowBlur = 22; ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0;
        rr(2, 2, w - 4, h / 2 - 2, h / 2 - 2); ctx.fillStyle = "rgba(255,255,255,.14)"; ctx.fill();
      } else {
        ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.fill(); ctx.strokeStyle = "rgba(170,240,255,.35)"; ctx.lineWidth = 1.5; rr(0, 0, w, h, h / 2); ctx.stroke();
      }
      text(label, w / 2, h / 2 + (sub ? -7 : 1), h * 0.36, "#fff", "center", "800", primary ? "rgba(0,40,80,.6)" : null, 3);
      if (sub) text(sub, w / 2, h / 2 + 17, h * 0.2, "rgba(255,255,255,.75)", "center", "600", null, 1.5);
    };
  }
  function iconBtn(kind) {
    return (w, h) => {
      ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2, 0, TAU); ctx.fillStyle = "rgba(255,255,255,.09)"; ctx.fill(); ctx.strokeStyle = "rgba(170,240,255,.35)"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.save(); ctx.translate(w / 2, h / 2); ctx.strokeStyle = "#e8fcff"; ctx.fillStyle = "#e8fcff"; ctx.lineWidth = 2.6; ctx.lineCap = "round"; ctx.lineJoin = "round";
      const s = w / 44;
      ctx.scale(s, s);
      if (kind === "back") { ctx.beginPath(); ctx.moveTo(4, -9); ctx.lineTo(-6, 0); ctx.lineTo(4, 9); ctx.stroke(); }
      else if (kind === "next") { ctx.beginPath(); ctx.moveTo(-4, -9); ctx.lineTo(6, 0); ctx.lineTo(-4, 9); ctx.stroke(); }
      else if (kind === "retry") { ctx.beginPath(); ctx.arc(0, 0, 9, -0.6, TAU - 1.2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(6, -13); ctx.lineTo(10, -5); ctx.lineTo(1, -5); ctx.closePath(); ctx.fill(); }
      else if (kind === "sound") {
        ctx.beginPath(); ctx.moveTo(-10, -4); ctx.lineTo(-5, -4); ctx.lineTo(1, -9); ctx.lineTo(1, 9); ctx.lineTo(-5, 4); ctx.lineTo(-10, 4); ctx.closePath(); ctx.fill();
        if (!muted) { ctx.beginPath(); ctx.arc(2, 0, 6, -0.9, 0.9); ctx.stroke(); ctx.beginPath(); ctx.arc(2, 0, 11, -0.9, 0.9); ctx.stroke(); }
        else { ctx.beginPath(); ctx.moveTo(6, -6); ctx.lineTo(14, 6); ctx.moveTo(14, -6); ctx.lineTo(6, 6); ctx.stroke(); }
      }
      ctx.restore();
    };
  }
  function muteBtn(x, y) { btn("mute", x, y, 44, 44, () => setMuted(!muted), iconBtn("sound")); }
  function panel(x, y, w, h, r) {
    rr(x, y, w, h, r || 26); const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, "rgba(20,50,90,.82)"); g.addColorStop(1, "rgba(8,20,50,.9)");
    ctx.fillStyle = g; ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 30; ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(150,240,255,.3)"; ctx.lineWidth = 1.5; rr(x, y, w, h, r || 26); ctx.stroke();
  }
  function drawLogoFlower(x, y, R, t) {
    ctx.globalCompositeOperation = "lighter"; drawGlow(x, y, R * 3.4, rampHue(t * 4), 0.7); ctx.globalCompositeOperation = "source-over";
    for (let ring = 0; ring < 3; ring++) {
      const n = 8 + ring * 2, h = [200, 265, 320][ring] + Math.sin(t * 0.8 + ring) * 18;
      flower(x, y, n, R * (1.15 - ring * 0.27) * (1 + Math.sin(t * 2 + ring) * 0.04), R * (0.5 - ring * 0.08), h, t * 0.3 * (ring % 2 ? -1 : 1) + ring * 0.2, 90, 60 + ring * 8, 0.95, false);
    }
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, R * 0.12, 0, TAU); ctx.fill();
  }
  function drawSeedIcon(x, y, on) {
    ctx.globalCompositeOperation = "lighter"; if (on) drawGlow(x, y, 20, 190, 0.9 + 0.1 * Math.sin(T * 5)); ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = on ? "#eaffff" : "rgba(255,255,255,.2)"; ctx.beginPath(); ctx.arc(x, y, on ? 6 : 5, 0, TAU); ctx.fill();
  }
  function drawTypeIcon(type, x, y, sc) {
    const fake = { type, x, y, id: 0, state: 0, hue: 210, rot: 0, timer: 1, timer0: 1, t0: 0, depth: 0 };
    const sv = TY[type].r; ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.translate(-x, -y);
    drawCrystal(fake, { chain: 0, time: 0 }); ctx.restore();
  }

  // ---------- screens ----------
  const TIPS = {
    0: { t: "Tap anywhere to plant a spark", s: "Every crystal it touches blooms too" },
    1: { t: "Bigger chains multiply your score", s: "Hunt for the spot that lights the most" },
    2: { type: "p", t: "Golden Pulse", s: "Blooms huge and reaches far" },
    3: { type: "t", t: "Black Thorn", s: "Withers a bloom and breaks your combo" },
    4: { type: "i", t: "Frost Bud", s: "Waits a moment, then blooms huge" },
    5: { type: "m", t: "Magnet Bloom", s: "Pulls neighbours in before bursting" },
    6: { type: "s", t: "Seed Splitter", s: "Scatters seeds that bloom a beat later" },
    7: { type: "b", t: "Ember Lily", s: "Fizzles early, detonates after 8 blooms" },
    9: { t: "Two sparks this time", s: "The second waits for the garden to settle" },
  };
  function drawTitle() {
    drawBackdrop(0);
    if (att) { ctx.globalAlpha = 0.85; drawWorld(att.world); ctx.globalAlpha = 1; }
    drawFx();
    const bob = Math.sin(T * 1.2) * 4;
    drawLogoFlower(270, 225 + bob, 66, T);
    // wordmark
    ctx.save(); ctx.translate(270, 405 + bob);
    const g = ctx.createLinearGradient(0, -50, 0, 50); g.addColorStop(0, "#9ff7ff"); g.addColorStop(0.5, "#b8a2ff"); g.addColorStop(1, "#ff8ad8");
    ctx.font = `900 92px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; try { ctx.letterSpacing = "6px"; } catch (e) {}
    ctx.shadowColor = "rgba(120,220,255,.75)"; ctx.shadowBlur = 30; ctx.fillStyle = g; ctx.fillText("CHAIN", 0, -34);
    ctx.shadowColor = "rgba(255,120,220,.7)"; ctx.fillText("BLOOM", 0, 52);
    ctx.shadowBlur = 0; ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.strokeText("CHAIN", 0, -34); ctx.strokeText("BLOOM", 0, 52);
    try { ctx.letterSpacing = "0px"; } catch (e) {}
    ctx.restore();
    text("ONE TAP  -  ONE BLOOM", 270, 505 + bob, 17, "rgba(190,240,255,.8)", "center", "700", null, 5);
    btn("play", 100, 600, 340, 78, () => goto("map"), pill("PLAY", true, totalStars() ? totalStars() + " of " + LEVELS * 3 + " stars" : "40 levels"));
    btn("zen", 100, 700, 340, 68, () => startZen(), pill("ZEN", false, "Endless  -  Daily garden"));
    if (bestZen) text("Best Zen  " + fmt(bestZen), 270, 800, 16, "rgba(190,240,255,.7)", "center", "700", null, 2);
    muteBtn(486, 24);
    text("Tap - Space retry - M mute", 270, 925, 13, "rgba(190,240,255,.4)", "center", "600", null, 1);
  }
  const NODE = (i) => { const k = i % PER_PACK, y = 800 - k * 62, x = 270 + Math.sin(k * 0.95 + 0.4) * 150; return [x, y]; };
  function drawMap() {
    drawBackdrop(0.1);
    const pack = mapPage, names = CB.PACKS;
    // path
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(120,255,240,.22)"; ctx.lineWidth = 6; ctx.setLineDash([2, 14]); ctx.lineDashOffset = -T * 10; ctx.beginPath();
    for (let k = 0; k < PER_PACK; k++) { const [x, y] = NODE(pack * PER_PACK + k); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke(); ctx.setLineDash([]);
    let cur = -1;
    for (let k = 0; k < PER_PACK; k++) {
      const i = pack * PER_PACK + k, [x, y] = NODE(i), ok = unlocked(i), st = stars(i);
      if (ok && st === 0) cur = i;
      ctx.save(); ctx.translate(x, y); ctx.rotate(k * 1.3);
      ctx.fillStyle = ok ? "rgba(20,120,110,.85)" : "rgba(10,50,60,.8)"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 31, 0.25, TAU - 0.25); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(120,255,225,.25)"; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
      btn("lv" + i, x - 34, y - 34, 68, 68, () => { if (unlocked(i)) startLevel(i); }, (w, h) => {
        ctx.save(); ctx.translate(w / 2, h / 2);
        if (ok) {
          const hh = st ? 50 : 190; ctx.globalCompositeOperation = "lighter"; drawGlow(0, 0, 44, hh, st ? 0.8 : 0.5); ctx.globalCompositeOperation = "source-over";
          const gg = ctx.createRadialGradient(0, -6, 2, 0, 0, 27); gg.addColorStop(0, st ? "#fff6c8" : "#c8f8ff"); gg.addColorStop(1, st ? "#ffb64d" : "#3fb6d6");
          ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 0, 25, 0, TAU); ctx.fill();
          text(String(i + 1), 0, 1, 24, "#06283a", "center", "900");
        } else {
          ctx.fillStyle = "rgba(20,50,80,.9)"; ctx.beginPath(); ctx.arc(0, 0, 23, 0, TAU); ctx.fill();
          ctx.strokeStyle = "rgba(160,200,230,.55)"; ctx.lineWidth = 2.5; rr(-8, -2, 16, 12, 3); ctx.stroke(); ctx.beginPath(); ctx.arc(0, -3, 6, Math.PI, 0); ctx.stroke();
        }
        ctx.restore();
      });
      if (ok) for (let s = 0; s < 3; s++) star5(x + (s - 1) * 19, y + 42 + (s === 1 ? 3 : 0), 8, s < st ? "#ffd75e" : "rgba(255,255,255,.14)");
      if (i === cur) { const p = (T * 1.1) % 1; ctx.strokeStyle = `rgba(160,255,255,${1 - p})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 30 + p * 26, 0, TAU); ctx.stroke(); }
    }
    text(names[pack].toUpperCase(), 270, 88, 30, "#fff", "center", "900", "rgba(120,220,255,.6)", 3);
    text("PACK " + (pack + 1) + " OF " + LEVELS / PER_PACK, 270, 122, 14, "rgba(190,240,255,.65)", "center", "700", null, 3);
    text(totalStars() + " / " + LEVELS * 3 + "  STARS", 270, 150, 15, "#ffd75e", "center", "800", null, 2);
    btn("back", 24, 24, 44, 44, () => goto("title"), iconBtn("back")); muteBtn(486, 24);
    if (pack > 0) btn("pp", 20, 890, 60, 44, () => (mapPage = pack - 1), iconBtn("back"));
    if (pack < PACK_LAST) btn("pn", 460, 890, 60, 44, () => (mapPage = pack + 1), iconBtn("next"));
    for (let k = 0; k <= PACK_LAST; k++) { ctx.fillStyle = k === pack ? "#9ff7ff" : "rgba(255,255,255,.25)"; ctx.beginPath(); ctx.arc(270 + (k - PACK_LAST / 2) * 22, 912, k === pack ? 5 : 4, 0, TAU); ctx.fill(); }
  }
  function drawLoading() {
    drawBackdrop(0.2);
    drawLogoFlower(270, 440, 46, T * 2);
    text("Growing the garden...", 270, 550, 22, "rgba(200,245,255,.9)", "center", "700", null, 2);
  }
  function drawHUD() {
    const w = G.world, L = G.level;
    btn("back", 20, 20, 44, 44, () => exitPlay(), iconBtn("back"));
    btn("retry", 424, 20, 44, 44, () => retry(), iconBtn("retry"));
    muteBtn(476, 20);
    if (G.mode === "zen") {
      text("ZEN  -  ROUND " + (G.zen.round + 1), 270, 34, 18, "#fff", "center", "900", null, 3);
      text("DAILY " + String(dailySeed()).replace(/(\d{4})(\d\d)(\d\d)/, "$1-$2-$3"), 270, 58, 12, "rgba(190,240,255,.6)", "center", "700", null, 2);
      for (let i = 0; i < 3; i++) flower(86 + i * 26, 92, 6, 11, 5, i < G.zen.lives ? 330 : 220, 0, i < G.zen.lives ? 85 : 20, i < G.zen.lives ? 62 : 35, i < G.zen.lives ? 1 : 0.5, false);
      text(fmt(G.zen.total + G.scoreShown), 480, 92, 22, "#fff", "right", "900", "rgba(120,220,255,.5)");
    } else {
      text("LEVEL " + (G.idx + 1), 270, 32, 20, "#fff", "center", "900", null, 3);
      text(L.name.toUpperCase(), 270, 57, 12, "rgba(190,240,255,.6)", "center", "700", null, 2.5);
    }
    // goal bar
    const bx = 60, bw = 420, by = 118;
    if (G.mode !== "zen") text(fmt(G.scoreShown), 480, 92, 22, "#fff", "right", "900", "rgba(120,220,255,.5)");
    text("BLOOM " + w.count + " / " + L.goal, G.mode === "zen" ? 270 : 60, G.mode === "zen" ? 92 : 92, 17, G.showGoalPulse > 0 || w.count >= L.goal ? "#ffe27a" : "#dff", G.mode === "zen" ? "center" : "left", "800", null, 2);
    rr(bx, by, bw, 10, 5); ctx.fillStyle = "rgba(255,255,255,.1)"; ctx.fill();
    const max = Math.max(L.s3, L.M * 0.6), pf = (v) => clamp(v / max, 0, 1);
    if (w.count > 0) {
      const g = ctx.createLinearGradient(bx, 0, bx + bw, 0); g.addColorStop(0, "#19d3c5"); g.addColorStop(0.6, "#8a7cff"); g.addColorStop(1, "#ff8ad8");
      rr(bx, by, Math.max(10, bw * pf(w.count)), 10, 5); ctx.fillStyle = g; ctx.shadowColor = "rgba(120,220,255,.7)"; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0;
    }
    [[L.goal, 1], [L.s2, 2], [L.s3, 3]].forEach(([v, n]) => {
      const x = bx + bw * pf(v), got = w.count >= v;
      star5(x, by - 12 + 0, n === 1 ? 8 : 7, got ? "#ffd75e" : "rgba(255,255,255,.28)");
      ctx.fillStyle = got ? "#ffd75e" : "rgba(255,255,255,.35)"; ctx.fillRect(x - 1, by, 2, 10);
    });
    // sparks
    for (let i = 0; i < G.taps0; i++) drawSeedIcon(270 + (i - (G.taps0 - 1) / 2) * 30, 936, i < w.tapsLeft);
    text(w.tapsLeft ? (G.taps0 > 1 ? w.tapsLeft + " SPARKS LEFT" : "") : "", 270, 912, 11, "rgba(190,240,255,.55)", "center", "700", null, 2);
  }
  function drawCombo() {
    const cb = G.combo; if (!cb.chain && G.phase === "ready") return;
    if (G.phase === "ready" && !cb.chain) return;
    const pop = 1 + cb.pop * 0.22, h = rampHue(cb.chain);
    ctx.save(); ctx.translate(270, 872); ctx.scale(pop, pop);
    text("x" + cb.mult.toFixed(1), 0, 0, 62, `hsl(${h},100%,78%)`, "center", "900", `hsl(${h},100%,55%)`);
    ctx.restore();
    text(cb.chain ? "CHAIN " + cb.chain : "COMBO BROKEN", 270, 918, 15, "rgba(230,250,255,.85)", "center", "800", null, 4);
  }
  function drawPlay() {
    const w = G.world, L = G.level;
    drawBackdrop(0);
    ctx.save();
    if (shake > 0.1) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    // hint ring
    const showHint = G.phase === "ready" && w.tapsLeft === G.taps0 && (G.idx === 0 && G.mode === "campaign" || G.fails >= 2);
    if (showHint && L.hint[0]) {
      const hp = L.hint[w.level.taps - w.tapsLeft] || L.hint[0], p = (T * 0.9) % 1;
      ctx.strokeStyle = `rgba(255,240,160,${0.8 - p * 0.6})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(hp.x, hp.y, 14 + p * 30, 0, TAU); ctx.stroke();
      ctx.fillStyle = "rgba(255,240,160,.7)"; ctx.beginPath(); ctx.arc(hp.x, hp.y, 5, 0, TAU); ctx.fill();
      if (G.idx === 0 && G.mode === "campaign") { ctx.save(); ctx.translate(hp.x + 6, hp.y + 16 + Math.sin(T * 5) * 4); ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 30); ctx.lineTo(8, 24); ctx.lineTo(14, 36); ctx.lineTo(19, 33); ctx.lineTo(13, 22); ctx.lineTo(22, 22); ctx.closePath(); ctx.fill(); ctx.restore(); }
    }
    drawWorld(w); drawFx();
    if (mouse && G.phase === "ready" && w.tapsLeft > 0 && matchMedia("(hover:hover)").matches) {
      ctx.strokeStyle = "rgba(200,250,255,.45)"; ctx.lineWidth = 2; ctx.setLineDash([5, 7]); ctx.beginPath(); ctx.arc(mouse.x, mouse.y, CB.SPARK.R, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
    drawHUD(); drawCombo();
    // tip card
    const tip = G.mode === "campaign" ? TIPS[G.idx] : null;
    if (tip && G.phase === "ready" && w.tapsLeft === G.taps0) {
      panel(40, 832, 460, 86, 22);
      if (tip.type) { ctx.globalCompositeOperation = "source-over"; drawTypeIcon(tip.type, 92, 875, 1.35); }
      else drawLogoFlower(92, 875, 20, T);
      text(tip.t, 316, 860, 21, "#fff", "center", "900", null, 0);
      text(tip.s, 316, 892, 14, "rgba(200,240,255,.82)", "center", "600");
    }
    if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash * 0.25})`; const e = ext(); ctx.fillRect(e.l, e.t, e.r - e.l, e.b - e.t); }
    if (G.phase === "result") drawResult();
  }
  function drawResult() {
    const R = G.res, k = clamp(G.resT / 0.4, 0, 1), e = 1 - Math.pow(1 - k, 3);
    ctx.fillStyle = `rgba(3,8,26,${0.55 * e})`; const ex = ext(); ctx.fillRect(ex.l, ex.t, ex.r - ex.l, ex.b - ex.t);
    ctx.save(); ctx.globalAlpha = e; ctx.translate(0, (1 - e) * 40);
    const zen = G.mode === "zen";
    panel(50, 250, 440, 500, 34);
    if (R.win) {
      text(R.stars === 3 ? "PERFECT BLOOM" : "BLOOMED!", 270, 305, 34, "#fff", "center", "900", "rgba(120,240,255,.7)", 3);
      text(zen ? "ROUND " + G.zen.round + " CLEARED" : "LEVEL " + (G.idx + 1) + "  -  " + G.level.name.toUpperCase(), 270, 340, 13, "rgba(190,240,255,.65)", "center", "700", null, 2);
      for (let s = 0; s < 3; s++) {
        const at = 0.5 + (s + 1) * 0.4, on = s < R.stars, t = clamp((G.resT - at) / 0.35, 0, 1), sc = on ? (t < 1 ? 0.3 + 1.0 * t + Math.sin(t * Math.PI) * 0.4 : 1) : 1;
        const x = 270 + (s - 1) * 100, y = 405 - (s === 1 ? 14 : 0);
        ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.translate(-x, -y);
        if (on && t > 0) { ctx.globalCompositeOperation = "lighter"; drawGlow(x, y, 70, 48, 0.8 * t); ctx.globalCompositeOperation = "source-over"; star5(x, y, 44, "#ffd75e", "#fff3b0"); }
        else star5(x, y, 44, "rgba(255,255,255,.08)", "rgba(255,255,255,.25)");
        ctx.restore();
      }
    } else {
      text("NOT QUITE", 270, 305, 34, "#fff", "center", "900", "rgba(255,140,200,.6)", 3);
      text(zen ? "ROUND " + (G.zen.round + 1) : "LEVEL " + (G.idx + 1), 270, 340, 13, "rgba(190,240,255,.65)", "center", "700", null, 2);
      flower(270, 415, 8, 44, 16, 220, T * 0.1, 30, 32, 0.9, false);
    }
    text("Bloomed " + R.count + " of " + G.level.goal + " needed", 270, 478, 20, R.win ? "#c8ffe8" : "#ffb8d8", "center", "800");
    const shown = Math.round(R.score * clamp((G.resT - 0.3) / 1.2, 0, 1));
    text(fmt(shown), 270, 538, 46, "#fff", "center", "900", "rgba(120,220,255,.5)");
    let sub = "Longest chain " + R.maxChain + (R.bonus ? "   -   bonus +" + fmt(R.bonus) : "");
    if (R.win && !zen && R.newBest && G.resT > 1.2) sub = "NEW BEST!   " + sub;
    text(sub, 270, 578, 14, "rgba(200,240,255,.75)", "center", "600");
    if (zen) {
      text("Lives " + G.zen.lives + "   Total " + fmt(G.zen.total), 270, 606, 14, "rgba(255,215,120,.9)", "center", "700");
      if (R.win) btn("next", 90, 632, 360, 66, () => zenNext(), pill("NEXT ROUND", true));
      else btn("next", 90, 632, 360, 66, () => zenAfterFail(), pill(G.zen.lives > 0 ? "TRY AGAIN" : "SEE RESULT", true));
    } else if (R.win) {
      btn("next", 200, 626, 250, 66, () => nextLevel(), pill(G.idx + 1 < LEVELS ? "NEXT" : "MAP", true));
      btn("retry2", 90, 626, 96, 66, () => retry(), pill("", false));
      drawRetryGlyph(138, 659);
    } else {
      btn("retry2", 90, 626, 360, 66, () => retry(), pill("RETRY", true));
    }
    if (!zen) { btn("maplnk", 190, 710, 160, 40, () => { mapPage = Math.floor(G.idx / PER_PACK); goto("map"); }, (w, h) => text("BACK TO MAP", w / 2, h / 2, 13, "rgba(190,240,255,.8)", "center", "800", null, 2)); }
    ctx.restore();
  }
  function drawRetryGlyph(x, y) { ctx.save(); ctx.translate(x, y); ctx.strokeStyle = "#fff"; ctx.fillStyle = "#fff"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.beginPath(); ctx.arc(0, 0, 11, -0.6, TAU - 1.2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(8, -15); ctx.lineTo(13, -5); ctx.lineTo(2, -5); ctx.closePath(); ctx.fill(); ctx.restore(); }
  function drawZenOver() {
    drawBackdrop(0.35);
    const z = G.zen;
    drawLogoFlower(270, 250, 56, T);
    text("GARDEN AT REST", 270, 360, 34, "#fff", "center", "900", "rgba(120,220,255,.6)", 3);
    text("ZEN  -  " + z.cleared + " ROUNDS", 270, 400, 14, "rgba(190,240,255,.7)", "center", "700", null, 3);
    text(fmt(z.total), 270, 480, 64, "#fff", "center", "900", "rgba(120,220,255,.5)");
    text(z.total >= bestZen && z.total > 0 ? "NEW BEST" : "BEST  " + fmt(bestZen), 270, 540, 18, "#ffd75e", "center", "800", null, 3);
    btn("again", 100, 620, 340, 72, () => startZen(), pill("AGAIN", true));
    btn("home", 100, 712, 340, 60, () => goto("title"), pill("MENU", false));
    muteBtn(486, 24);
  }
  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); applyView();
    ui.btns = [];
    if (state === "title") drawTitle();
    else if (state === "map") drawMap();
    else if (state === "loading") drawLoading();
    else if (state === "zenover") drawZenOver();
    else if (state === "play" && G && G.world) drawPlay();
    if (paused) {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "rgba(3,8,26,.7)"; ctx.fillRect(0, 0, c.width, c.height); applyView();
      text("PAUSED", 270, 470, 44, "#fff", "center", "900", "rgba(120,220,255,.6)", 6);
    }
  }

  // ---------- loop ----------
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!paused) { try { update(dt); } catch (e) { console.error(e); } }
    try { draw(); } catch (e) { console.error(e); }
    requestAnimationFrame(loop);
  }
  addEventListener("resize", fit); fit();
  requestAnimationFrame(loop);

  // debug / test hooks
  window.__cb = {
    get state() { return state; }, get G() { return G; }, get prog() { return prog; }, getLevel, startLevel, startZen, goto,
    setPaused(p) { paused = p; }, get tick() { return G && G.world ? G.world.tick : -1; },
    info() { return G && G.world ? { phase: G.phase, tick: G.world.tick, count: G.world.count, goal: G.level.goal, res: G.res, zen: G.zen } : { state }; },
    tapAt(x, y) { if (G && G.phase === "ready") plant(x, y); },
    trySim(i, x, y, tick) {
      const lv = getLevel(i), w = CB.makeWorld(lv); w.quiet = true; CB.warp(w, tick == null ? 60 : tick); CB.tap(w, x, y); CB.runToSettle(w); return w.count;
    },
  };
})();
