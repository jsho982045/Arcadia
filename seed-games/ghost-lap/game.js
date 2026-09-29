// Ghost Lap - a one-touch neon racer where every lap you finish becomes a deadly ghost.
(() => {
  "use strict";
  const W = 540, H = 960, TAU = Math.PI * 2;
  const c = document.getElementById("c");
  const ctx = c.getContext("2d");
  const FONT = '"Avenir Next","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';

  // ---------- helpers ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null || v === undefined ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} },
  };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; };
  const ease = (t) => 1 - Math.pow(1 - clamp01(t), 3);
  function mulberry(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function rr(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function txt(s, x, y, size, col, align, weight, glow, gcol, italic) {
    ctx.font = (italic ? "italic " : "") + (weight || 800) + " " + size + "px " + FONT;
    ctx.textAlign = align || "center"; ctx.textBaseline = "alphabetic";
    if (glow) { ctx.shadowColor = gcol || col; ctx.shadowBlur = glow; }
    ctx.fillStyle = col; ctx.fillText(s, x, y); ctx.shadowBlur = 0;
  }
  function spaced(s, x, y, size, col, sp, align, weight) {
    ctx.font = (weight || 700) + " " + size + "px " + FONT; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    let w = 0; const ws = [];
    for (const ch of s) { const m = ctx.measureText(ch).width; ws.push(m); w += m + sp; }
    w -= sp;
    let cx = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.fillStyle = col; let i = 0;
    for (const ch of s) { ctx.fillText(ch, cx, y); cx += ws[i++] + sp; }
  }

  // ---------- constants ----------
  const TW = 118, HALF = TW / 2, LIM = HALF - 3;
  const CD = 19, NEAR = 42, MAXG = 4, SAMPLE = 1 / 30;
  const TURN = 3.1;
  const PLAYER = "#2ef2ff";
  const GHOST_COLS = ["#ff4d6d", "#ffb703", "#b388ff", "#ff7bd5", "#7dffb0"];
  const ARCH = [
    { name: "NEON DELTA", h: [[2, 0.11], [3, 0.16]], edge: "#3d8bff", rim: "#9cc8ff", bg0: "#10214d", bg1: "#03050d", grid: "rgba(90,140,255,0.075)", asphalt: "#0a1126" },
    { name: "MAGENTA LOOP", h: [[3, 0.09], [4, 0.13]], edge: "#e83dff", rim: "#ffa8f5", bg0: "#2d1145", bg1: "#060310", grid: "rgba(220,90,255,0.07)", asphalt: "#130a26" },
    { name: "TOXIC SPINE", h: [[2, 0.17], [5, 0.07]], edge: "#2dffa8", rim: "#b6ffe2", bg0: "#0c3a3a", bg1: "#020b0c", grid: "rgba(60,255,190,0.06)", asphalt: "#08171d" },
  ];

  // ---------- canvas fit ----------
  let VS = 1, track = null, trackLayer = null;
  function fit() {
    const s = Math.min(innerWidth / W, innerHeight / H), d = Math.min(window.devicePixelRatio || 1, 3);
    c.style.width = W * s + "px"; c.style.height = H * s + "px";
    c.width = Math.max(1, Math.round(W * s * d)); c.height = Math.max(1, Math.round(H * s * d));
    VS = s * d;
    if (track) renderTrackLayer();
  }

  // ---------- track generation ----------
  function resample(raw, N) {
    const M = raw.length, cum = new Float64Array(M + 1);
    for (let i = 0; i < M; i++) { const a = raw[i], b = raw[(i + 1) % M]; cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]); }
    const L = cum[M], out = []; let j = 0;
    for (let i = 0; i < N; i++) {
      const s = (i * L) / N; while (cum[j + 1] < s) j++;
      const a = raw[j], b = raw[(j + 1) % M], f = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    }
    return { pts: out, L };
  }
  function radiusAt(P, N, i, k) {
    const a = P[(i - k + N) % N], b = P[i], d = P[(i + k) % N];
    const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(d[0] - b[0], d[1] - b[1]), ca = Math.hypot(d[0] - a[0], d[1] - a[1]);
    const cr = Math.abs((b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]));
    return cr < 1e-6 ? 1e9 : (ab * bc * ca) / (2 * cr);
  }
  function buildTrack(kind) {
    const A = ARCH[kind], rnd = mulberry((Math.random() * 1e9) | 0);
    const N = 640, BX = W / 2 - HALF - 16, BY = (H - 138 - 14) / 2 - HALF - 4, CY = 138 + (H - 138 - 14) / 2;
    let res = null;
    for (let att = 0; att < 140 && !res; att++) {
      const shrink = Math.max(0, 1 - att * 0.009);
      const ph = A.h.map(() => rnd() * TAU), am = A.h.map((h) => h[1] * (0.75 + rnd() * 0.5) * shrink);
      const M = 720, raw = []; let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
      for (let j = 0; j < M; j++) {
        const th = (j / M) * TAU; let r = 1;
        for (let k = 0; k < A.h.length; k++) r += am[k] * Math.cos(A.h[k][0] * th + ph[k]);
        const x = Math.cos(th) * r, y = Math.sin(th) * r * 1.75;
        raw.push([x, y]); mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mny = Math.min(mny, y); mxy = Math.max(mxy, y);
      }
      const sx = (2 * BX) / (mxx - mnx), sy = (2 * BY) / (mxy - mny), cx = (mxx + mnx) / 2, cy = (mxy + mny) / 2;
      for (const p of raw) { p[0] = W / 2 + (p[0] - cx) * sx; p[1] = CY + (p[1] - cy) * sy; }
      const rs = resample(raw, N), P = rs.pts;
      let ok = true;
      for (let i = 0; i < N && ok; i += 2) if (radiusAt(P, N, i, 4) < 104) ok = false;
      for (let i = 0; i < N && ok; i++) for (let j = i + 1; j < N; j++) {
        const circ = Math.min(j - i, N - (j - i)); if (circ < N * 0.13) continue;
        if (Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]) < TW + 30) { ok = false; break; }
      }
      if (ok) res = rs;
    }
    if (!res) {
      const raw = []; for (let j = 0; j < 720; j++) { const th = (j / 720) * TAU; raw.push([W / 2 + Math.cos(th) * BX, CY + Math.sin(th) * BY]); }
      res = resample(raw, N);
    }
    let P = res.pts;
    if (rnd() < 0.5) P.reverse();
    if (rnd() < 0.5) P = P.map((p) => [W - p[0], p[1]]);
    // start where the track is straightest
    const curv = P.map((_, i) => 1 / radiusAt(P, N, i, 4));
    let bi = 0, bv = 1e9;
    for (let i = 0; i < N; i++) { let s = 0; for (let o = -34; o <= 34; o += 2) s += curv[(i + o + N) % N]; if (s < bv) { bv = s; bi = i; } }
    P = P.slice(bi).concat(P.slice(0, bi));
    const px = new Float32Array(N), py = new Float32Array(N), tx = new Float32Array(N), ty = new Float32Array(N);
    for (let i = 0; i < N; i++) { px[i] = P[i][0]; py[i] = P[i][1]; }
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N, dx = px[b] - px[a], dy = py[b] - py[a], l = Math.hypot(dx, dy) || 1;
      tx[i] = dx / l; ty[i] = dy / l;
    }
    return { kind, N, L: res.L, ds: res.L / N, px, py, tx, ty, theme: A, name: A.name };
  }
  function posAt(f) {
    const N = track.N; f = ((f % N) + N) % N;
    const i0 = Math.floor(f), i1 = (i0 + 1) % N, fr = f - i0;
    const x = lerp(track.px[i0], track.px[i1], fr), y = lerp(track.py[i0], track.py[i1], fr);
    return { x, y, th: Math.atan2(lerp(track.ty[i0], track.ty[i1], fr), lerp(track.tx[i0], track.tx[i1], fr)) };
  }

  // ---------- static layer (track, glow) ----------
  function renderTrackLayer() {
    const q = Math.min(2.5, Math.max(1, VS));
    const cv = trackLayer || (trackLayer = document.createElement("canvas"));
    cv.width = Math.round(W * q); cv.height = Math.round(H * q);
    const g = cv.getContext("2d"); g.setTransform(q, 0, 0, q, 0, 0);
    const th = track.theme, N = track.N;
    const bg = g.createRadialGradient(W / 2, H * 0.48, 40, W / 2, H * 0.5, H * 0.78);
    bg.addColorStop(0, th.bg0); bg.addColorStop(1, th.bg1); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.strokeStyle = th.grid; g.lineWidth = 1; g.beginPath();
    for (let x = 0; x <= W; x += 45) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); }
    for (let y = 0; y <= H; y += 45) { g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); }
    g.stroke();
    const r = mulberry(track.kind * 77 + 5);
    g.fillStyle = "#fff";
    for (let i = 0; i < 70; i++) { g.globalAlpha = 0.05 + r() * 0.2; g.fillRect(r() * W, r() * H, 1.5, 1.5); }
    g.globalAlpha = 1;
    const P = new Path2D();
    P.moveTo(track.px[0], track.py[0]);
    for (let i = 1; i < N; i++) P.lineTo(track.px[i], track.py[i]);
    P.closePath();
    g.lineJoin = "round"; g.lineCap = "round";
    g.strokeStyle = th.edge;
    g.globalAlpha = 0.05; g.lineWidth = TW + 110; g.stroke(P);
    g.globalAlpha = 0.08; g.lineWidth = TW + 66; g.stroke(P);
    g.globalAlpha = 0.14; g.lineWidth = TW + 34; g.shadowColor = th.edge; g.shadowBlur = 36; g.stroke(P);
    g.globalAlpha = 1; g.lineWidth = TW + 8; g.shadowBlur = 20; g.stroke(P);
    g.shadowBlur = 0;
    g.strokeStyle = th.rim; g.globalAlpha = 0.5; g.setLineDash([12, 12]); g.lineWidth = TW + 8; g.stroke(P);
    g.setLineDash([]); g.globalAlpha = 1;
    g.strokeStyle = th.asphalt; g.lineWidth = TW; g.stroke(P);
    g.strokeStyle = "rgba(255,255,255,0.03)"; g.lineWidth = TW - 30; g.stroke(P);
    g.strokeStyle = "rgba(255,255,255,0.05)"; g.lineWidth = 16; g.stroke(P);
    g.strokeStyle = "rgba(255,255,255,0.24)"; g.lineWidth = 2; g.setLineDash([16, 24]); g.stroke(P); g.setLineDash([]);
    // direction chevrons
    g.strokeStyle = th.edge; g.lineWidth = 3; g.lineCap = "butt";
    for (let i = 40; i < N; i += 64) {
      g.save(); g.translate(track.px[i], track.py[i]); g.rotate(Math.atan2(track.ty[i], track.tx[i]));
      g.globalAlpha = 0.28; g.beginPath(); g.moveTo(-7, -13); g.lineTo(4, 0); g.lineTo(-7, 13); g.stroke();
      g.globalAlpha = 0.14; g.beginPath(); g.moveTo(-19, -13); g.lineTo(-8, 0); g.lineTo(-19, 13); g.stroke();
      g.restore();
    }
    g.globalAlpha = 1;
    // start / finish line
    g.save(); g.translate(track.px[0], track.py[0]); g.rotate(Math.atan2(track.ty[0], track.tx[0]));
    const cw = TW / 12;
    for (let row = 0; row < 2; row++) for (let k = 0; k < 12; k++) {
      g.fillStyle = (k + row) % 2 ? "rgba(255,255,255,0.92)" : "rgba(10,14,30,0.95)";
      g.fillRect(-9 + row * 9, -HALF + k * cw, 9, cw);
    }
    g.shadowColor = "#fff"; g.shadowBlur = 16; g.strokeStyle = "rgba(255,255,255,0.7)"; g.lineWidth = 1.5;
    g.strokeRect(-9, -HALF, 18, TW); g.restore();
  }

  // ---------- audio ----------
  const AU = (() => {
    let ac = null, master = null, eng = null, noiseBuf = null, muted = store.get("ghostlap.mute", "0") === "1";
    function init() {
      try {
        if (!ac) {
          const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
          ac = new AC(); master = ac.createGain(); master.gain.value = muted ? 0 : 0.6; master.connect(ac.destination);
          noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 1.5), ac.sampleRate);
          const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
          const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 400; f.Q.value = 2;
          const eg = ac.createGain(); eg.gain.value = 0;
          const o1 = ac.createOscillator(), o2 = ac.createOscillator(), o3 = ac.createOscillator();
          o1.type = "sawtooth"; o2.type = "square"; o3.type = "sine";
          const g1 = ac.createGain(), g2 = ac.createGain(), g3 = ac.createGain(); g1.gain.value = 0.5; g2.gain.value = 0.18; g3.gain.value = 0.7;
          o1.connect(g1); o2.connect(g2); o3.connect(g3); g1.connect(f); g2.connect(f); g3.connect(f); f.connect(eg); eg.connect(master);
          o1.start(); o2.start(); o3.start();
          const ns = ac.createBufferSource(); ns.buffer = noiseBuf; ns.loop = true;
          const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1700; bp.Q.value = 5;
          const sg = ac.createGain(); sg.gain.value = 0; ns.connect(bp); bp.connect(sg); sg.connect(master); ns.start();
          eng = { o1, o2, o3, f, eg, sg };
        }
        if (ac.state === "suspended") ac.resume();
      } catch (e) {}
    }
    function tone(f, d, type, vol, to, delay) {
      if (!ac || muted) return;
      try {
        const t = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
        o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.03);
      } catch (e) {}
    }
    function noise(d, vol, f0, f1) {
      if (!ac || muted) return;
      try {
        const t = ac.currentTime, s = ac.createBufferSource(), g = ac.createGain(), fl = ac.createBiquadFilter();
        s.buffer = noiseBuf; fl.type = "lowpass"; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + d);
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        s.connect(fl); fl.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + d + 0.05);
      } catch (e) {}
    }
    return {
      init,
      get muted() { return muted; },
      toggle() {
        muted = !muted; store.set("ghostlap.mute", muted ? "1" : "0");
        if (master) master.gain.setTargetAtTime(muted ? 0 : 0.6, ac.currentTime, 0.02);
        init();
      },
      suspend() { try { if (ac) ac.suspend(); } catch (e) {} },
      resume() { try { if (ac && ac.state === "suspended") ac.resume(); } catch (e) {} },
      engine(on, sp, slip) {
        if (!eng || !ac) return;
        const t = ac.currentTime, base = 46 + 100 * sp;
        eng.o1.frequency.setTargetAtTime(base, t, 0.06); eng.o2.frequency.setTargetAtTime(base * 1.503, t, 0.06); eng.o3.frequency.setTargetAtTime(base * 0.5, t, 0.06);
        eng.f.frequency.setTargetAtTime(240 + 1300 * sp, t, 0.08);
        eng.eg.gain.setTargetAtTime(on ? 0.1 + 0.1 * sp : 0, t, 0.12);
        eng.sg.gain.setTargetAtTime(on ? clamp01(slip) * 0.05 : 0, t, 0.05);
      },
      lap() { tone(523, 0.16, "triangle", 0.18); tone(659, 0.16, "triangle", 0.18, 0, 0.07); tone(784, 0.28, "triangle", 0.2, 0, 0.14); tone(1046, 0.4, "sine", 0.12, 0, 0.2); },
      near(n) { tone(640 + Math.min(n, 12) * 55, 0.09, "square", 0.05, 900 + Math.min(n, 12) * 60); },
      wall() { noise(0.22, 0.6, 1400, 160); tone(140, 0.18, "sine", 0.35, 50); },
      crash() { noise(0.9, 0.95, 3200, 90); tone(220, 0.7, "sawtooth", 0.28, 38); tone(90, 0.8, "sine", 0.4, 30); },
      spawn() { tone(260, 0.5, "sine", 0.14, 1000); },
      dissolve() { tone(900, 0.5, "sine", 0.07, 180); },
      click() { tone(500, 0.08, "triangle", 0.12, 800); },
      go() { tone(392, 0.12, "square", 0.06); tone(784, 0.25, "square", 0.07, 0, 0.1); },
    };
  })();

  // ---------- particles & fx ----------
  const parts = [], rings = [], skids = [], slines = [], pops = [];
  function burst(x, y, n, col, smin, smax, life, ang, spread, size) {
    for (let i = 0; i < n && parts.length < 700; i++) {
      const a = ang === undefined ? rand(0, TAU) : ang + rand(-spread, spread), s = rand(smin, smax), l = life * rand(0.6, 1.2);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: l, max: l, col, size: size || 2.2, type: 0 });
    }
  }
  function ring(x, y, col, r0, vr, life, w) { rings.push({ x, y, r: r0, vr, life, max: life, col, w: w || 3 }); }
  function popup(s, x, y, col, size, life) { pops.push({ x: clamp(x, 60, W - 60), y, s, col, size: size || 22, life: life || 1.1, max: life || 1.1 }); }

  // ---------- state ----------
  let mode = "title", G = null, kind = (Math.random() * 3) | 0, best = Number(store.get("ghostlap.best", 0)) || 0;
  let paused = false, tNow = 0, titleT = 0, overT = 0, shake = 0, flash = 0, flashCol = "255,255,255", runsCount = Number(store.get("ghostlap.runs", 0)) || 0;
  const dbg = { god: false };
  const keys = { l: false, r: false }, pointers = new Map();
  const MUTE = { x: W - 40, y: 46, r: 22 };

  function prepareTrack() {
    kind = (kind + 1) % 3; track = buildTrack(kind); parts.length = 0; skids.length = 0; rings.length = 0; pops.length = 0; slines.length = 0;
    renderTrackLayer();
  }

  function startRun() {
    const th0 = Math.atan2(track.ty[0], track.tx[0]);
    parts.length = 0; skids.length = 0; rings.length = 0; pops.length = 0; slines.length = 0;
    const tut = store.get("ghostlap.tut", "0") !== "1";
    G = {
      x: track.px[0], y: track.py[0], th: th0, v: 150, vx: Math.cos(th0) * 150, vy: Math.sin(th0) * 150, steer: 0,
      idx: 0, prog: 0, lap: 0, lapClock: 0, total: 0, hits: 0, hitCd: 0, clean: true, streak: 0,
      score: 0, disp: 0, combo: 0, comboT: 0, maxCombo: 0, ghosts: [], ghostsMade: 0, rec: [track.px[0], track.py[0], th0], recAcc: 0,
      lock: 0.3, wait: tut, tut, goT: tut ? 0 : 1.2, trail: [], pw: null, alive: true, why: "", crashT: 0, slow: 1, drift: 0, slip: 0, toastGhost: false,
      lapFlash: 0, hitFlash: 0, lastLapTime: 0, driftAcc: 0,
    };
    mode = "play"; overT = 0; shake = 0; flash = 0;
    if (!tut) AU.go();
    runsCount++; store.set("ghostlap.runs", runsCount);
  }

  function steerInput() {
    let l = keys.l, r = keys.r;
    for (const s of pointers.values()) { if (s < 0) l = true; else r = true; }
    return (r ? 1 : 0) - (l ? 1 : 0);
  }

  function ghostPos(gh, t) {
    const p = gh.path, n = p.length / 3, f = clamp(t, 0, gh.dur) / SAMPLE;
    let i0 = Math.floor(f); const fr = f - i0; i0 = Math.min(i0, n - 1); const i1 = Math.min(i0 + 1, n - 1);
    return { x: lerp(p[i0 * 3], p[i1 * 3], fr), y: lerp(p[i0 * 3 + 1], p[i1 * 3 + 1], fr), th: p[i0 * 3 + 2] + angDiff(p[i0 * 3 + 2], p[i1 * 3 + 2]) * fr };
  }

  function comboMult() { return Math.min(8, 1 + Math.floor(G.combo / 2)); }

  function award(gh, dmin) {
    const g = G; g.combo++; g.maxCombo = Math.max(g.maxCombo, g.combo); g.comboT = 3.4;
    const close = clamp01(1 - (dmin - CD) / (NEAR - CD)), m = comboMult(), pts = Math.round((8 + 22 * close) * m);
    g.score += pts;
    popup((close > 0.7 ? "CLOSE! +" : "+") + pts, g.x, g.y - 30, close > 0.7 ? "#ffe26a" : "#9ff4ff", close > 0.7 ? 26 : 20);
    burst(g.x, g.y, 10, gh.col, 90, 260, 0.45, undefined, 0, 2);
    AU.near(g.combo);
  }

  function lapComplete() {
    const g = G, lt = g.lapClock;
    g.rec.push(g.x, g.y, g.th);
    const dur = Math.max(1.5, (g.rec.length / 3 - 1) * SAMPLE);
    const alive = g.ghosts.filter((o) => !o.dying);
    while (alive.length >= MAXG) { const o = alive.shift(); o.dying = 1.6; AU.dissolve(); popup("GHOST FADES", o.x || W / 2, o.y || H / 2, o.col, 16, 1.0); }
    g.ghosts.push({ path: Float32Array.from(g.rec), dur, t: -1.3, col: GHOST_COLS[g.ghostsMade % GHOST_COLS.length], id: g.ghostsMade, dying: 0, near: false, nearMin: 99, nearT: 0, x: track.px[0], y: track.py[0], th: 0, a: 0, active: false });
    g.ghostsMade++; g.lap++;
    const mult = g.clean ? Math.min(5, 1 + g.streak) : 1;
    g.streak = g.clean ? g.streak + 1 : 0;
    const tb = Math.max(0, Math.round((track.L / 300 - lt) * 30)), pts = 100 * mult + tb;
    g.score += pts; g.lastLapTime = lt; g.lapFlash = 1;
    popup("LAP " + g.lap + "  +" + pts, W / 2, 190, "#ffffff", 30, 1.6);
    popup(g.clean ? "CLEAN LAP x" + mult : "LAP TIME " + lt.toFixed(1) + "s", W / 2, 222, g.clean ? "#7dffb0" : "#9fb4ff", 18, 1.6);
    if (g.hits > 0) { g.hits--; popup("SHIELD RESTORED", W / 2, 250, "#ffd23f", 15, 1.4); }
    ring(track.px[0], track.py[0], "#ffffff", 20, 260, 0.6, 3);
    g.clean = true; g.lapClock = 0; g.rec = [g.x, g.y, g.th]; g.recAcc = 0;
    AU.lap(); AU.spawn();
    if (!g.toastGhost && runsCount <= 3) { g.toastGhost = true; popup("THAT LAP IS NOW A GHOST", W / 2, 290, "#ff9db0", 20, 2.4); }
  }

  function crash(why) {
    const g = G; if (!g.alive) return;
    g.alive = false; g.why = why; mode = "crash"; g.crashT = 0; g.slow = 0.3;
    shake = 28; flash = 1; flashCol = "255,255,255";
    burst(g.x, g.y, 90, PLAYER, 100, 560, 1.1, undefined, 0, 2.6);
    burst(g.x, g.y, 40, "#ffffff", 60, 380, 0.8, undefined, 0, 2);
    burst(g.x, g.y, 30, "#ff3d6a", 60, 300, 1.0, undefined, 0, 3);
    ring(g.x, g.y, PLAYER, 10, 520, 0.7, 5); ring(g.x, g.y, "#ff3d6a", 6, 340, 0.9, 3);
    AU.crash(); AU.engine(false, 0, 0);
    if (g.score > best) { best = g.score; g.newBest = true; store.set("ghostlap.best", best); }
    try { if (window.Arcadia) { Arcadia.submitScore(g.score); if (Arcadia.gameOver) Arcadia.gameOver(); } } catch (e) {}
  }

  function updateGhosts(dt) {
    const g = G;
    for (let k = g.ghosts.length - 1; k >= 0; k--) {
      const gh = g.ghosts[k];
      if (gh.dying) {
        gh.dying -= dt;
        if (gh.dying <= 0) { g.ghosts.splice(k, 1); continue; }
      }
      const p0x = gh.path[0], p0y = gh.path[1];
      if (gh.t < 0 && gh.t + dt >= 0 && g.alive && !gh.dying && Math.hypot(g.x - p0x, g.y - p0y) < 130) gh.t = -0.0001;
      else gh.t += dt;
      if (gh.t >= gh.dur + 0.3) gh.t = -0.7;
      if (gh.t > 0 && gh.t < 0.05 && gh.t - dt <= 0 && !gh.dying) ring(p0x, p0y, gh.col, 8, 90, 0.5, 2);
      const p = ghostPos(gh, gh.t); gh.x = p.x; gh.y = p.y; gh.th = p.th;
      gh.a = gh.t < 0 ? 0 : clamp01(gh.t / 0.5) * clamp01((gh.dur - gh.t) / 0.5);
      gh.active = !gh.dying && gh.t > 0.5 && gh.t < gh.dur - 0.25;
      if (gh.dying && Math.random() < 0.6) burst(gh.x, gh.y, 1, gh.col, 20, 120, 0.6, undefined, 0, 2);
      if (!g.alive) continue;
      const d = Math.hypot(g.x - gh.x, g.y - gh.y);
      if (gh.active) {
        if (d < CD && !dbg.god) { crash("ghost"); return; }
        if (d < NEAR) {
          if (!gh.near) { gh.near = true; gh.nearMin = d; gh.nearT = 0; } else gh.nearMin = Math.min(gh.nearMin, d);
          gh.nearT += dt;
          if (Math.random() < dt * 30) burst((g.x + gh.x) / 2, (g.y + gh.y) / 2, 1, gh.col, 40, 160, 0.35, undefined, 0, 1.6);
          if (gh.nearT >= 0.65) { award(gh, gh.nearMin); gh.nearT = 0; gh.nearMin = d; }
        } else if (gh.near) { gh.near = false; if (d < NEAR + 40 && gh.nearT > 0.05) award(gh, gh.nearMin); }
      } else gh.near = false;
    }
  }

  function simStep(dt) {
    const g = G;
    g.total += dt; g.lapClock += dt; g.hitCd -= dt; g.lock -= dt;
    g.comboT -= dt; if (g.comboT <= 0 && g.combo) g.combo = 0;
    const inp = g.lock > 0 ? 0 : steerInput();
    g.steer += (inp - g.steer) * Math.min(1, dt * 14);
    const target = Math.min(340, 232 + 11 * g.lap);
    g.v += (target - g.v) * Math.min(1, dt * 0.9) - Math.abs(g.steer) * dt * 14;
    g.th += g.steer * TURN * dt;
    const hx = Math.cos(g.th), hy = Math.sin(g.th), grip = 9 - 4 * Math.abs(g.steer);
    g.vx += (hx * g.v - g.vx) * Math.min(1, grip * dt); g.vy += (hy * g.v - g.vy) * Math.min(1, grip * dt);
    g.x += g.vx * dt; g.y += g.vy * dt;
    const sp = Math.hypot(g.vx, g.vy);
    g.slip = Math.abs(g.vx * hy - g.vy * hx) / Math.max(40, sp);
    // recording
    g.recAcc += dt;
    while (g.recAcc >= SAMPLE) { g.recAcc -= SAMPLE; g.rec.push(g.x, g.y, g.th); }
    // trail
    g.trail.push(g.x, g.y); if (g.trail.length > 44) g.trail.splice(0, 2);
    // nearest track point
    const N = track.N;
    let bi = g.idx, bd = 1e18;
    for (let o = -24; o <= 24; o++) {
      const i = (g.idx + o + N) % N, dx = track.px[i] - g.x, dy = track.py[i] - g.y, d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; bi = i; }
    }
    if (bd > 130 * 130) { bd = 1e18; for (let i = 0; i < N; i++) { const dx = track.px[i] - g.x, dy = track.py[i] - g.y, d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; bi = i; } } }
    let di = bi - g.idx; if (di > N / 2) di -= N; else if (di < -N / 2) di += N;
    g.prog += di; g.idx = bi;
    const d = Math.sqrt(bd);
    // walls
    if (d > LIM) {
      const cx = track.px[bi], cy = track.py[bi], nx = (cx - g.x) / d, ny = (cy - g.y) / d;
      g.x = cx - nx * (LIM - 2); g.y = cy - ny * (LIM - 2);
      const vin = g.vx * nx + g.vy * ny;
      if (vin < 0) { g.vx -= 1.55 * vin * nx; g.vy -= 1.55 * vin * ny; }
      g.vx *= 0.82; g.vy *= 0.82; g.v *= 0.86;
      g.th += angDiff(g.th, Math.atan2(g.vy, g.vx)) * 0.7;
      burst(g.x - nx * 2, g.y - ny * 2, 5, "#ffd27a", 80, 320, 0.35, Math.atan2(ny, nx), 1.2, 2);
      if (g.hitCd <= 0) {
        g.hitCd = 0.55; g.hits++; g.clean = false; g.combo = 0; g.comboT = 0; g.hitFlash = 1;
        shake = Math.max(shake, 9); flash = Math.max(flash, 0.25); flashCol = "255,120,80";
        AU.wall();
        if (g.hits >= 3) { crash("wall"); return; }
        popup(g.hits === 2 ? "LAST SHIELD!" : "WALL HIT", g.x, g.y - 34, "#ffb35a", 20, 0.9);
      }
    }
    if (g.prog >= N) { g.prog -= N; lapComplete(); }
    // drift / skid
    const skidding = g.slip > 0.2 && sp > 120 && Math.abs(g.steer) > 0.3;
    if (skidding) {
      const px = -hy, py = hx, bx = g.x - hx * 8, by = g.y - hy * 8;
      const w = [bx + px * 5.5, by + py * 5.5, bx - px * 5.5, by - py * 5.5];
      if (g.pw) { skids.push({ x1: g.pw[0], y1: g.pw[1], x2: w[0], y2: w[1], life: 7 }, { x1: g.pw[2], y1: g.pw[3], x2: w[2], y2: w[3], life: 7 }); if (skids.length > 700) skids.splice(0, skids.length - 700); }
      g.pw = w;
      if (Math.random() < dt * 40) parts.push({ x: bx, y: by, vx: -hx * 20 + rand(-14, 14), vy: -hy * 20 + rand(-14, 14), life: 0.5, max: 0.5, col: "#ffffff", size: rand(4, 8), type: 1 });
      if (Math.random() < dt * 22) burst(bx, by, 1, "#ffd9a0", 40, 160, 0.3, Math.atan2(-hy, -hx), 0.8, 1.6);
      if (g.slip > 0.27) {
        g.driftAcc += dt * 7 * comboMult();
        if (g.combo) g.comboT = Math.max(g.comboT, 0.8);
        if (g.driftAcc >= 1) { const p = Math.floor(g.driftAcc); g.score += p; g.driftAcc -= p; }
      }
    } else g.pw = null;
    g.drift = skidding ? 1 : 0;
    updateGhosts(dt);
  }

  function update(rawDt) {
    tNow += rawDt; flash = Math.max(0, flash - rawDt * 2.6); shake = Math.max(0, shake - rawDt * 38);
    if (mode === "title") { titleT += rawDt; }
    // fx (real time-ish)
    const fdt = rawDt * (G && mode !== "title" ? G.slow : 1);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life -= fdt; if (p.life <= 0) { parts.splice(i, 1); continue; }
      if (p.type === 0) { p.vx *= 1 - 2.2 * fdt; p.vy *= 1 - 2.2 * fdt; } else { p.size += fdt * 22; }
      p.x += p.vx * fdt; p.y += p.vy * fdt;
    }
    for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.life -= fdt; r.r += r.vr * fdt; r.vr *= 1 - 3 * fdt; if (r.life <= 0) rings.splice(i, 1); }
    for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.life -= rawDt; p.y -= 26 * rawDt; if (p.life <= 0) pops.splice(i, 1); }
    for (let i = slines.length - 1; i >= 0; i--) { const s = slines[i]; s.life -= rawDt; if (s.life <= 0) slines.splice(i, 1); }
    for (let i = skids.length - 1; i >= 0; i--) { skids[i].life -= rawDt; if (skids[i].life <= 0) skids.splice(i, 1); }
    if (!G || mode === "title") { AU.engine(false, 0, 0); return; }
    const g = G;
    g.disp += (g.score - g.disp) * Math.min(1, rawDt * 9); if (Math.abs(g.score - g.disp) < 0.5) g.disp = g.score;
    g.lapFlash = Math.max(0, g.lapFlash - rawDt * 2.5); g.hitFlash = Math.max(0, g.hitFlash - rawDt * 3);
    if (g.goT > 0) g.goT -= rawDt;
    if (mode === "play") {
      if (g.wait) { AU.engine(false, 0, 0); return; }
      const dt = rawDt;
      const n = Math.max(1, Math.ceil(dt / (1 / 90))), h = dt / n;
      for (let i = 0; i < n && mode === "play"; i++) simStep(h);
      if (mode === "play") {
        const sp = Math.hypot(g.vx, g.vy);
        AU.engine(true, clamp01((sp - 120) / 240), g.drift ? g.slip * 3 : 0);
        if (sp > 240 && Math.random() < rawDt * 45 * (sp - 220) / 120) {
          const a = rand(0, TAU), r0 = rand(70, 160);
          slines.push({ x: g.x + Math.cos(a) * r0, y: g.y + Math.sin(a) * r0, a, len: rand(26, 70), life: 0.28, max: 0.28 });
        }
      }
    } else {
      // crash / over: ghosts keep driving in slow motion
      g.crashT += rawDt;
      g.slow = mode === "crash" ? lerp(0.3, 1, clamp01((g.crashT - 0.5) / 0.6)) : 1;
      updateGhostsFree(rawDt * g.slow);
      if (mode === "crash" && g.crashT > 1.15) { mode = "over"; overT = 0; }
      if (mode === "over") overT += rawDt;
    }
  }
  function updateGhostsFree(dt) {
    const keep = G.alive; G.alive = false; updateGhosts(dt); G.alive = keep;
  }

  // ---------- input ----------
  function toLogical(e) {
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }
  function goTitle() { prepareTrack(); mode = "title"; titleT = 0; G = null; AU.engine(false, 0, 0); }
  function retry() { prepareTrack(); startRun(); }
  function anyStart() {
    if (mode === "title") { AU.click(); startRun(); }
    else if (mode === "over" && overT > 0.75) { AU.click(); retry(); }
  }
  c.addEventListener("pointerdown", (e) => {
    e.preventDefault(); if (e.pointerType === "mouse") AU.init();
    const p = toLogical(e);
    if (Math.hypot(p.x - MUTE.x, p.y - MUTE.y) < 32) { AU.toggle(); AU.click(); return; }
    if (mode === "title") { anyStart(); return; }
    if (mode === "over") {
      if (overT > 0.75) { if (p.y > 745 && p.y < 800 && Math.abs(p.x - W / 2) < 90) { AU.click(); goTitle(); } else anyStart(); }
      return;
    }
    if (mode === "play") {
      pointers.set(e.pointerId, p.x < W / 2 ? -1 : 1);
      if (G.wait) { G.wait = false; store.set("ghostlap.tut", "1"); G.goT = 1.0; G.lock = 0.15; AU.go(); }
      try { c.setPointerCapture(e.pointerId); } catch (er) {}
    }
  });
  c.addEventListener("pointermove", (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, toLogical(e).x < W / 2 ? -1 : 1);
  });
  const up = (e) => { pointers.delete(e.pointerId); AU.init(); };
  c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up); c.addEventListener("lostpointercapture", up);
  c.addEventListener("touchend", () => AU.init(), { passive: true });
  c.addEventListener("contextmenu", (e) => e.preventDefault());
  addEventListener("blur", () => { pointers.clear(); keys.l = keys.r = false; });
  addEventListener("keydown", (e) => {
    AU.init();
    const k = e.key;
    if (k === "ArrowLeft" || k === "a" || k === "A") { keys.l = true; e.preventDefault(); if (G && G.wait && mode === "play") { G.wait = false; store.set("ghostlap.tut", "1"); G.goT = 1.0; G.lock = 0.15; } }
    else if (k === "ArrowRight" || k === "d" || k === "D") { keys.r = true; e.preventDefault(); if (G && G.wait && mode === "play") { G.wait = false; store.set("ghostlap.tut", "1"); G.goT = 1.0; G.lock = 0.15; } }
    else if (k === "m" || k === "M") AU.toggle();
    else if (k === " " || k === "Enter") { e.preventDefault(); if (mode === "play" && G && G.wait) { G.wait = false; store.set("ghostlap.tut", "1"); G.goT = 1.0; } else anyStart(); }
    else if (k === "Escape" && mode === "over" && overT > 0.5) goTitle();
    else if (mode === "title" && (k === "ArrowUp" || k === "ArrowDown")) anyStart();
  });
  addEventListener("keyup", (e) => {
    const k = e.key;
    if (k === "ArrowLeft" || k === "a" || k === "A") keys.l = false;
    else if (k === "ArrowRight" || k === "d" || k === "D") keys.r = false;
  });
  function setPaused(p) { paused = p; if (p) { AU.suspend(); pointers.clear(); } else { AU.resume(); last = performance.now(); } }
  if (window.Arcadia) { try { Arcadia.onPause(() => setPaused(true)); Arcadia.onResume(() => setPaused(false)); } catch (e) {} }
  document.addEventListener("visibilitychange", () => { if (document.hidden) setPaused(true); else setPaused(false); });

  // ---------- drawing ----------
  const BODY = new Path2D("M17 0 L9 -5.6 L-8 -7.2 L-13 -5.2 L-13 5.2 L-8 7.2 L9 5.6 Z");
  const CABIN = new Path2D("M5 -3.6 L-3 -4.8 L-6 -3.4 L-6 3.4 L-3 4.8 L5 3.6 Z");
  function drawCar(x, y, th, col, a, glow, fill) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(th); ctx.globalAlpha = a; ctx.lineJoin = "round";
    ctx.shadowColor = col; ctx.shadowBlur = glow;
    ctx.fillStyle = fill || "#08101f"; ctx.fill(BODY);
    ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.stroke(BODY);
    ctx.shadowBlur = 0;
    ctx.fillStyle = col; ctx.globalAlpha = a * 0.55; ctx.fill(CABIN);
    ctx.globalAlpha = a; ctx.fillStyle = "#fff"; ctx.fillRect(13, -4.2, 2, 2); ctx.fillRect(13, 2.2, 2, 2);
    ctx.fillStyle = col; ctx.fillRect(-14.5, -7, 3, 14);
    ctx.restore();
  }

  function drawWorld() {
    const g = G;
    ctx.drawImage(trackLayer, 0, 0, W, H);
    // skid marks
    ctx.lineCap = "round"; ctx.strokeStyle = "#cfe6ff"; ctx.lineWidth = 2.4;
    for (const s of skids) { ctx.globalAlpha = Math.min(1, s.life / 4) * 0.22; ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke(); }
    ctx.globalAlpha = 1;
    if (!g) return;
    // ghost portals + ghosts
    ctx.globalCompositeOperation = "lighter";
    for (const gh of g.ghosts) {
      if (gh.t < 0 && !gh.dying && gh.t > -1.2) {
        const k = clamp01(1 + gh.t / 1.2), px = gh.path[0], py = gh.path[1];
        ctx.strokeStyle = gh.col; ctx.globalAlpha = 0.15 + 0.5 * k; ctx.lineWidth = 2 + 2 * k;
        ctx.beginPath(); ctx.arc(px, py, 30 - 14 * k + Math.sin(tNow * 18) * 1.5, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 0.1 * k; ctx.fillStyle = gh.col; ctx.beginPath(); ctx.arc(px, py, 28, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    const alive = g.ghosts.filter((o) => !o.dying).sort((a, b) => b.id - a.id);
    for (const gh of g.ghosts) {
      if (gh.a <= 0.01) continue;
      const rank = alive.indexOf(gh);
      const fade = gh.dying ? clamp01(gh.dying / 1.6) * (0.5 + 0.5 * Math.sin(tNow * 40)) : 1;
      const base = gh.dying ? 0.8 : 1 - Math.max(0, rank) * 0.09;
      const a = gh.a * base * fade;
      // trail
      ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round"; ctx.strokeStyle = gh.col;
      let prev = { x: gh.x, y: gh.y };
      for (let k = 1; k <= 9; k++) {
        const p = ghostPos(gh, gh.t - k * 0.05);
        ctx.globalAlpha = a * (1 - k / 10) * 0.55; ctx.lineWidth = 9 * (1 - k / 11);
        ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke(); prev = p;
      }
      ctx.globalCompositeOperation = "source-over";
      if (gh.active) { // danger halo
        ctx.globalAlpha = a * 0.28; ctx.fillStyle = gh.col; ctx.beginPath(); ctx.arc(gh.x, gh.y, 19, 0, TAU); ctx.fill();
      }
      drawCar(gh.x, gh.y, gh.th, gh.col, a * (gh.active ? 0.95 : 0.55), 16, "rgba(20,10,30,0.7)");
    }
    ctx.globalAlpha = 1;
    // speed lines
    ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = "#bfeaff"; ctx.lineWidth = 1.6; ctx.lineCap = "round";
    for (const s of slines) {
      const k = s.life / s.max, r0 = (1 - k) * 60;
      ctx.globalAlpha = Math.sin(k * Math.PI) * 0.35;
      ctx.beginPath(); ctx.moveTo(s.x + Math.cos(s.a) * r0, s.y + Math.sin(s.a) * r0); ctx.lineTo(s.x + Math.cos(s.a) * (r0 + s.len), s.y + Math.sin(s.a) * (r0 + s.len)); ctx.stroke();
    }
    // player trail
    if (g.alive) {
      const t = g.trail;
      for (let i = 2; i < t.length; i += 2) {
        const k = i / t.length;
        ctx.strokeStyle = PLAYER; ctx.globalAlpha = k * 0.35; ctx.lineWidth = 12 * k;
        ctx.beginPath(); ctx.moveTo(t[i - 2], t[i - 1]); ctx.lineTo(t[i], t[i + 1]); ctx.stroke();
        ctx.strokeStyle = "#fff"; ctx.globalAlpha = k * 0.4; ctx.lineWidth = 3 * k;
        ctx.beginPath(); ctx.moveTo(t[i - 2], t[i - 1]); ctx.lineTo(t[i], t[i + 1]); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    // smoke puffs
    for (const p of parts) if (p.type === 1) { ctx.globalAlpha = (p.life / p.max) * 0.16; ctx.fillStyle = "#dfefff"; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    // player
    if (g.alive) {
      ctx.globalCompositeOperation = "lighter";
      const lg = ctx.createLinearGradient(g.x, g.y, g.x + Math.cos(g.th) * 110, g.y + Math.sin(g.th) * 110);
      lg.addColorStop(0, "rgba(120,240,255,0.22)"); lg.addColorStop(1, "rgba(120,240,255,0)");
      ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(g.x + Math.cos(g.th) * 12, g.y + Math.sin(g.th) * 12);
      ctx.lineTo(g.x + Math.cos(g.th - 0.32) * 110, g.y + Math.sin(g.th - 0.32) * 110);
      ctx.lineTo(g.x + Math.cos(g.th + 0.32) * 110, g.y + Math.sin(g.th + 0.32) * 110); ctx.closePath(); ctx.fill();
      const rg = ctx.createRadialGradient(g.x, g.y, 2, g.x, g.y, 46);
      rg.addColorStop(0, "rgba(46,242,255,0.28)"); rg.addColorStop(1, "rgba(46,242,255,0)");
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(g.x, g.y, 46, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      const blink = g.hitCd > 0 && Math.floor(tNow * 24) % 2 ? 0.45 : 1;
      drawCar(g.x, g.y, g.th, PLAYER, blink, 20, "#0a1a2c");
      // combo proximity ring
    }
    // rings
    ctx.globalCompositeOperation = "lighter";
    for (const r of rings) { ctx.globalAlpha = clamp01(r.life / r.max); ctx.strokeStyle = r.col; ctx.lineWidth = r.w; ctx.beginPath(); ctx.arc(r.x, r.y, Math.max(0.1, r.r), 0, TAU); ctx.stroke(); }
    // sparks
    ctx.lineCap = "round";
    for (const p of parts) {
      if (p.type !== 0) continue;
      const a = p.life / p.max; ctx.globalAlpha = a; ctx.strokeStyle = p.col; ctx.lineWidth = p.size * (0.4 + a * 0.6);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    // popups
    for (const p of pops) {
      const k = p.life / p.max, sc = 1 + 0.25 * Math.max(0, k - 0.8) * 5;
      ctx.globalAlpha = clamp01(k * 3) ; ctx.save(); ctx.translate(p.x, p.y); ctx.scale(sc, sc);
      txt(p.s, 0, 0, p.size, p.col, "center", 900, 12, p.col, true); ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawMute() {
    const m = MUTE;
    ctx.fillStyle = "rgba(255,255,255,0.07)"; ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.translate(m.x - 2, m.y);
    ctx.fillStyle = "#e8f3ff"; ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(-3, -4); ctx.lineTo(3, -9); ctx.lineTo(3, 9); ctx.lineTo(-3, 4); ctx.lineTo(-8, 4); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 2; ctx.lineCap = "round";
    if (AU.muted) {
      ctx.strokeStyle = "#ff5c7a"; ctx.beginPath(); ctx.moveTo(7, -5); ctx.lineTo(14, 5); ctx.moveTo(14, -5); ctx.lineTo(7, 5); ctx.stroke();
    } else {
      ctx.strokeStyle = "#e8f3ff"; ctx.beginPath(); ctx.arc(3, 0, 6.5, -0.85, 0.85); ctx.stroke(); ctx.beginPath(); ctx.arc(3, 0, 11.5, -0.85, 0.85); ctx.stroke();
    }
    ctx.restore();
  }

  function drawHUD() {
    const g = G, th = track.theme;
    const bar = ctx.createLinearGradient(0, 0, 0, 132);
    bar.addColorStop(0, "rgba(2,4,12,0.92)"); bar.addColorStop(0.7, "rgba(2,4,12,0.6)"); bar.addColorStop(1, "rgba(2,4,12,0)");
    ctx.fillStyle = bar; ctx.fillRect(0, 0, W, 132);
    spaced("LAP", 28, 34, 13, "rgba(200,220,255,0.6)", 3, "left", 700);
    txt(String(g.lap + 1), 28, 82, 50, "#ffffff", "left", 900, 14, th.edge, true);
    spaced("SCORE", W / 2, 34, 13, "rgba(200,220,255,0.6)", 3, "center", 700);
    const pulse = 1 + (g.score - g.disp > 3 ? 0.05 : 0);
    ctx.save(); ctx.translate(W / 2, 82); ctx.scale(pulse, pulse);
    txt(String(Math.round(g.disp)), 0, 0, 50, "#ffffff", "center", 900, 16, PLAYER, true); ctx.restore();
    drawMute();
    // combo meter
    const m = comboMult(), active = g.combo > 0, bw = 200, bx = W / 2 - bw / 2, by = 100;
    ctx.fillStyle = "rgba(255,255,255,0.1)"; rr(bx, by, bw, 8, 4); ctx.fill();
    if (active) {
      const k = clamp01(g.comboT / 3.4), cg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      cg.addColorStop(0, "#2ef2ff"); cg.addColorStop(1, m >= 5 ? "#ff3df0" : "#ffe26a");
      ctx.fillStyle = cg; ctx.shadowColor = "#ffe26a"; ctx.shadowBlur = 10; rr(bx, by, Math.max(8, bw * k), 8, 4); ctx.fill(); ctx.shadowBlur = 0;
      txt("x" + m, bx + bw + 14, by + 12, 22 + m, m >= 5 ? "#ff8df6" : "#ffe26a", "left", 900, 12, undefined, true);
      spaced("CLOSE CALLS  " + g.combo, W / 2, by + 26, 10, "rgba(255,240,180,0.85)", 2, "center", 700);
    } else spaced("GRAZE GHOSTS FOR COMBO", W / 2, by + 26, 10, "rgba(200,220,255,0.35)", 2, "center", 700);
    // ghost pips
    spaced("GHOSTS", 28, 108, 10, "rgba(200,220,255,0.55)", 2, "left", 700);
    const live = g.ghosts.filter((o) => !o.dying);
    for (let i = 0; i < MAXG; i++) {
      const gh = live[i]; ctx.save(); ctx.translate(30 + i * 22, 120); ctx.scale(0.62, 0.62);
      ctx.lineWidth = 2.6; ctx.strokeStyle = gh ? gh.col : "rgba(255,255,255,0.2)"; ctx.fillStyle = gh ? gh.col : "rgba(0,0,0,0)";
      if (gh) { ctx.shadowColor = gh.col; ctx.shadowBlur = 8; ctx.globalAlpha = 0.5; ctx.fill(BODY); ctx.globalAlpha = 1; }
      ctx.stroke(BODY); ctx.restore();
    }
    // shields
    spaced("SHIELD", W - 28, 108, 10, "rgba(200,220,255,0.55)", 2, "right", 700);
    for (let i = 0; i < 3; i++) {
      const on = i < 3 - g.hits, x = W - 40 + (i - 2) * 0 - (2 - i) * 22 + 12, y = 121;
      ctx.save(); ctx.translate(x, y); ctx.beginPath();
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + Math.PI / 6; ctx.lineTo(Math.cos(a) * 8, Math.sin(a) * 8); }
      ctx.closePath();
      if (on) { ctx.fillStyle = g.hits === 2 && Math.floor(tNow * 6) % 2 ? "#ff5c7a" : "#ffd23f"; ctx.shadowColor = "#ffd23f"; ctx.shadowBlur = 10; ctx.fill(); }
      else { ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.restore();
    }
    // steer zone hints
    const s = steerInput();
    for (const side of [-1, 1]) {
      const on = s === side, cx = W / 2 + side * 180;
      ctx.globalAlpha = on ? 0.5 : 0.13; ctx.strokeStyle = "#cfe6ff"; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(cx - side * 10, 915); ctx.lineTo(cx + side * 10, 930); ctx.lineTo(cx - side * 10, 945); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // GO banner
    if (g.goT > 0 && !g.wait) {
      const k = g.goT / 1.2; ctx.globalAlpha = clamp01(k * 2);
      txt("GO!", W / 2, 840, 64 + (1 - k) * 20, "#ffffff", "center", 900, 24, PLAYER, true);
      spaced(track.name, W / 2, 878, 15, th.rim, 5, "center", 700);
      ctx.globalAlpha = 1;
    }
  }

  function drawTutorial() {
    const g = G, k = 0.6 + 0.4 * Math.sin(tNow * 4);
    ctx.fillStyle = "rgba(3,5,14,0.62)"; ctx.fillRect(0, 0, W, H);
    // steering zones
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? 0 : W / 2, gr = ctx.createLinearGradient(0, 560, 0, 960);
      gr.addColorStop(0, "rgba(46,242,255,0)"); gr.addColorStop(1, "rgba(46,242,255," + (0.16 + 0.08 * k) + ")");
      ctx.fillStyle = gr; ctx.fillRect(x0, 560, W / 2, 400);
      const cx = W / 2 + side * 135;
      ctx.strokeStyle = PLAYER; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.shadowColor = PLAYER; ctx.shadowBlur = 16; ctx.lineWidth = 8;
      for (let i = 0; i < 2; i++) {
        ctx.globalAlpha = 0.35 + 0.65 * ((Math.sin(tNow * 5 - i * 1.2) + 1) / 2);
        const ox = side * (i * 26 - 13);
        ctx.beginPath(); ctx.moveTo(cx + ox - side * 14, 730); ctx.lineTo(cx + ox + side * 14, 765); ctx.lineTo(cx + ox - side * 14, 800); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      txt(side < 0 ? "HOLD LEFT" : "HOLD RIGHT", cx, 850, 24, "#ffffff", "center", 900, 10, PLAYER, true);
      txt(side < 0 ? "steer left" : "steer right", cx, 878, 15, "rgba(200,225,255,0.7)", "center", 600);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 2; ctx.setLineDash([8, 10]); ctx.beginPath(); ctx.moveTo(W / 2, 640); ctx.lineTo(W / 2, 930); ctx.stroke(); ctx.setLineDash([]);
    // card
    const cy = 200;
    rr(50, cy, W - 100, 330, 26); ctx.fillStyle = "rgba(8,14,34,0.88)"; ctx.fill(); ctx.strokeStyle = "rgba(120,180,255,0.4)"; ctx.lineWidth = 2; ctx.stroke();
    txt("HOW TO RACE", W / 2, cy + 52, 28, "#ffffff", "center", 900, 14, PLAYER, true);
    const rows = [
      [PLAYER, "Your car drives itself. Steer to stay on track."],
      ["#ff4d6d", "Every lap you finish becomes a GHOST"],
      ["#ff4d6d", "that replays your line forever. Touch one = crash."],
      ["#ffe26a", "Skim past ghosts for close-call combos."],
      ["#ffb35a", "3 wall hits end the run. Clean laps heal."],
    ];
    for (let i = 0; i < rows.length; i++) {
      const y = cy + 100 + i * 44;
      ctx.fillStyle = rows[i][0]; ctx.shadowColor = rows[i][0]; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(84, y - 6, 5, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
      txt(rows[i][1], 102, y, 16, "#dfeaff", "left", 600);
    }
    ctx.globalAlpha = 0.5 + 0.5 * k;
    txt("TOUCH LEFT OR RIGHT TO BEGIN", W / 2, 610, 20, "#ffffff", "center", 900, 12, PLAYER, true);
    ctx.globalAlpha = 1;
  }

  function drawOver() {
    const g = G, k = ease(overT / 0.5);
    ctx.fillStyle = "rgba(2,3,10," + 0.66 * k + ")"; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalAlpha = k; ctx.translate(0, (1 - k) * 30);
    const title = g.why === "wall" ? "OFF THE TRACK" : "GHOSTED";
    txt(title, W / 2, 262, g.why === "wall" ? 58 : 78, "#ff3d6a", "center", 900, 30, "#ff3d6a", true);
    txt(title, W / 2, 262, g.why === "wall" ? 58 : 78, "#ffffff", "center", 900, 0, undefined, true);
    spaced(g.why === "wall" ? "THREE WALL HITS" : "YOU RAN INTO YOUR OWN PAST", W / 2, 296, 13, "rgba(255,190,205,0.8)", 3, "center", 700);
    rr(60, 330, W - 120, 262, 28); ctx.fillStyle = "rgba(8,14,34,0.82)"; ctx.fill(); ctx.strokeStyle = "rgba(120,180,255,0.35)"; ctx.lineWidth = 2; ctx.stroke();
    spaced("SCORE", W / 2, 378, 14, "rgba(200,220,255,0.65)", 4, "center", 700);
    const sc = Math.round(g.score * ease(overT / 0.9));
    txt(String(sc), W / 2, 468, 92, "#ffffff", "center", 900, 24, PLAYER, true);
    if (g.newBest) txt("NEW BEST!", W / 2, 510, 26, "#ffe26a", "center", 900, 16, "#ffb703", true);
    else spaced("BEST  " + best, W / 2, 506, 15, "rgba(255,226,106,0.9)", 3, "center", 800);
    ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(90, 534); ctx.lineTo(W - 90, 534); ctx.stroke();
    const st = [["LAPS", g.lap], ["GHOSTS", g.ghostsMade], ["BEST COMBO", g.maxCombo]];
    for (let i = 0; i < 3; i++) {
      const x = 150 + i * 120;
      txt(String(st[i][1]), x, 568, 30, "#ffffff", "center", 900);
      spaced(st[i][0], x, 588, 10, "rgba(200,220,255,0.6)", 2, "center", 700);
    }
    const p = 1 + Math.sin(tNow * 5) * 0.03;
    ctx.save(); ctx.translate(W / 2, 668); ctx.scale(p, p);
    rr(-150, -36, 300, 72, 36);
    const bg = ctx.createLinearGradient(-150, 0, 150, 0); bg.addColorStop(0, "#19c8ff"); bg.addColorStop(1, "#b04dff");
    ctx.fillStyle = bg; ctx.shadowColor = "#5b8dff"; ctx.shadowBlur = 24; ctx.fill(); ctx.shadowBlur = 0;
    txt(overT > 0.75 ? "TAP TO RETRY" : "...", 0, 9, 26, "#ffffff", "center", 900);
    ctx.restore();
    spaced("NEXT TRACK: " + ARCH[(kind + 1) % 3].name, W / 2, 735, 12, "rgba(200,220,255,0.55)", 3, "center", 700);
    txt("MENU", W / 2, 782, 18, "rgba(200,220,255,0.7)", "center", 800);
    ctx.restore();
  }

  function drawTitle() {
    ctx.drawImage(trackLayer, 0, 0, W, H);
    ctx.fillStyle = "rgba(3,5,14,0.55)"; ctx.fillRect(0, 0, W, H);
    const th = track.theme, t = titleT;
    // demo cars
    const spd = 250 / track.ds;
    for (let k = 4; k >= 0; k--) {
      const f = (t * spd - k * 30) % track.N, p = posAt(f < 0 ? f + track.N : f);
      const col = k === 0 ? PLAYER : GHOST_COLS[(k - 1) % 5];
      if (k > 0) { ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round"; ctx.strokeStyle = col;
        for (let j = 1; j <= 7; j++) { const a = posAt(f - j * 2.2), b = posAt(f - (j - 1) * 2.2); ctx.globalAlpha = 0.4 * (1 - j / 8); ctx.lineWidth = 8 * (1 - j / 9); ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(a.x, a.y); ctx.stroke(); }
        ctx.globalCompositeOperation = "source-over"; }
      drawCar(p.x, p.y, p.th, col, k === 0 ? 1 : 0.8, k === 0 ? 20 : 14, k === 0 ? "#0a1a2c" : "rgba(20,10,30,0.7)");
    }
    ctx.globalAlpha = 1;
    // logo band
    const lb = ctx.createLinearGradient(0, 190, 0, 560);
    lb.addColorStop(0, "rgba(3,5,14,0)"); lb.addColorStop(0.25, "rgba(3,5,14,0.72)"); lb.addColorStop(0.75, "rgba(3,5,14,0.72)"); lb.addColorStop(1, "rgba(3,5,14,0)");
    ctx.fillStyle = lb; ctx.fillRect(0, 190, W, 370);
    const intro = ease(t / 0.7);
    const logo = (s, y, size) => {
      ctx.save(); ctx.translate(W / 2 + 10, y + (1 - intro) * 40); ctx.transform(1, 0, -0.16, 1, 0, 0); ctx.globalAlpha = intro;
      for (let i = 5; i >= 1; i--) {
        const off = i * (10 + 4 * Math.sin(t * 1.7 + i * 0.8));
        ctx.globalAlpha = intro * 0.5 * (1 - i / 6);
        txt(s, -off, 0, size, GHOST_COLS[(i - 1) % 5], "center", 900, 0, undefined, true);
      }
      ctx.globalAlpha = intro;
      const gr = ctx.createLinearGradient(0, -size * 0.7, 0, size * 0.1);
      gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.55, "#bff9ff"); gr.addColorStop(1, PLAYER);
      txt(s, 0, 0, size, gr, "center", 900, 30, PLAYER, true);
      ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.font = "italic 900 " + size + "px " + FONT; ctx.textAlign = "center"; ctx.strokeText(s, 0, 0);
      const ph = t % 3.4; // glitch slice
      if (ph < 0.14) {
        ctx.save(); ctx.beginPath(); ctx.rect(-260, -size * 0.55 + ((ph * 900) % (size * 0.6)), 520, 14); ctx.clip();
        txt(s, 12, 0, size, "#ff3df0", "center", 900, 0, undefined, true); ctx.restore();
      }
      ctx.restore();
    };
    logo("GHOST", 336, 122); logo("LAP", 452, 122);
    ctx.globalAlpha = intro; spaced("ONE TOUCH  -  ENDLESS ECHOES", W / 2, 508, 15, "rgba(200,230,255,0.85)", 5, "center", 700); ctx.globalAlpha = 1;
    // start button
    const p = 1 + Math.sin(t * 4.5) * 0.035;
    ctx.save(); ctx.translate(W / 2, 668); ctx.scale(p, p);
    rr(-160, -40, 320, 80, 40);
    const bg = ctx.createLinearGradient(-160, 0, 160, 0); bg.addColorStop(0, "#19c8ff"); bg.addColorStop(1, "#b04dff");
    ctx.fillStyle = bg; ctx.shadowColor = "#5b8dff"; ctx.shadowBlur = 30; ctx.fill(); ctx.shadowBlur = 0;
    rr(-158, -38, 316, 76, 38); ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 2; ctx.stroke();
    txt("TAP TO RACE", 0, 10, 30, "#ffffff", "center", 900);
    ctx.restore();
    // best
    spaced("BEST SCORE", W / 2, 770, 13, "rgba(200,220,255,0.6)", 4, "center", 700);
    txt(String(best), W / 2, 820, 46, "#ffe26a", "center", 900, 16, "#ffb703", true);
    spaced("TRACK  " + track.name, W / 2, 866, 13, th.rim, 4, "center", 700);
    // controls hint
    for (const side of [-1, 1]) {
      const cx = W / 2 + side * 150, a = 0.25 + 0.2 * Math.sin(t * 3 + (side > 0 ? 1.5 : 0));
      ctx.globalAlpha = a + 0.1; ctx.strokeStyle = "#cfe6ff"; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(cx - side * 8, 910); ctx.lineTo(cx + side * 8, 924); ctx.lineTo(cx - side * 8, 938); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    spaced("HOLD LEFT / RIGHT TO STEER", W / 2, 930, 12, "rgba(200,220,255,0.6)", 3, "center", 700);
    drawMute();
  }

  function draw() {
    ctx.setTransform(VS, 0, 0, VS, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; ctx.shadowBlur = 0;
    ctx.fillStyle = "#04060f"; ctx.fillRect(0, 0, W, H);
    if (mode === "title") { drawTitle(); return; }
    ctx.save();
    if (shake > 0.2) ctx.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);
    drawWorld();
    ctx.restore();
    if (flash > 0.01) { ctx.fillStyle = "rgba(" + flashCol + "," + (flash * 0.5) + ")"; ctx.fillRect(0, 0, W, H); }
    if (G.lapFlash > 0) { ctx.strokeStyle = "rgba(125,255,176," + G.lapFlash * 0.6 + ")"; ctx.lineWidth = 10; ctx.strokeRect(5, 5, W - 10, H - 10); }
    if (G.hitFlash > 0) { const vg = ctx.createRadialGradient(W / 2, H / 2, 300, W / 2, H / 2, 680); vg.addColorStop(0, "rgba(255,80,60,0)"); vg.addColorStop(1, "rgba(255,80,60," + G.hitFlash * 0.45 + ")"); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H); }
    drawHUD();
    if (mode === "play" && G.wait) drawTutorial();
    if (mode === "over") drawOver();
  }

  // ---------- loop ----------
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000; last = now;
    if (!(dt > 0)) return;
    if (dt > 0.05) dt = 0.05;
    if (!paused) update(dt);
    draw();
  }

  // debug/test hooks (harmless in production)
  window.__gl = {
    info() { const g = G; return { mode, best, kind, N: track.N, lap: g ? g.lap : 0, score: g ? g.score : 0, hits: g ? g.hits : 0, ghosts: g ? g.ghosts.length : 0, x: g ? g.x : 0, y: g ? g.y : 0, th: g ? g.th : 0, v: g ? g.v : 0, why: g ? g.why : "", wait: g ? g.wait : false, combo: g ? g.combo : 0, maxCombo: g ? g.maxCombo : 0, idx: g ? g.idx : 0 }; },
    steerHint(off) {
      const g = G; if (!g) return 0;
      const N = track.N, la = Math.round(16 + g.v / 14), i = (g.idx + la) % N, o = off || 0;
      const want = Math.atan2(track.py[i] - track.tx[i] * o - g.y, track.px[i] + track.ty[i] * o - g.x), df = angDiff(g.th, want);
      return df > 0.05 ? 1 : df < -0.05 ? -1 : 0;
    },
    toGhost() { const g = G; const gh = g && g.ghosts.find((o) => o.active); if (!gh) return false; g.x = gh.x; g.y = gh.y; return true; },
    god(v) { dbg.god = !!v; },
    resetTut() { store.set("ghostlap.tut", "0"); },
  };

  prepareTrack();
  fit();
  addEventListener("resize", fit);
  addEventListener("orientationchange", () => setTimeout(fit, 120));
  requestAnimationFrame(frame);
})();
