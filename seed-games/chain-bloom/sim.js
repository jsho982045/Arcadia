// Chain Bloom - deterministic simulation, level generation and solver (no rendering here).
(function (root) {
  "use strict";
  const W = 540, H = 960, TICK = 1 / 60, LATE = 8, HOLD = 0.42, TAP_TICK = 60;
  const F = { x0: 46, x1: 494, y0: 190, y1: 818 };
  const TY = {
    n: { R: 72, dur: 0.85, r: 13 },
    p: { R: 150, dur: 1.15, r: 16 },
    m: { R: 88, dur: 0.9, r: 15, charge: 0.6, pullR: 210 },
    s: { R: 54, dur: 0.7, r: 14 },
    i: { R: 132, dur: 1.05, r: 14, delay: 0.95 },
    b: { R: 178, dur: 1.25, r: 16 },
    t: { r: 13 },
  };
  const SPARK = { R: 80, dur: 0.85 };
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const mult = (ch) => Math.pow(1.1, Math.max(0, ch - 1));

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(a, b) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }

  // ---------- world ----------
  function makeWorld(level) {
    const cs = level.crystals.map((s, i) => ({
      id: i, type: s.type, ax: s.ax, ay: s.ay, Ax: s.Ax, Ay: s.Ay, wx: s.wx, wy: s.wy, px: s.px, py: s.py,
      hue: s.hue, rot: s.rot, ox: 0, oy: 0, x: 0, y: 0, state: 0, timer: 0, timer0: 0, depth: 0, t0: 0,
    }));
    const w = {
      level, time: 0, tick: 0, crystals: cs, blooms: [], seeds: [], events: [], count: 0, chain: 0, maxChain: 0,
      score: 0, tapsLeft: level.taps, noteIdx: 0, breaks: 0, goalHit: false, lastTapTick: -1, quiet: false,
    };
    place(w);
    return w;
  }
  function place(w) {
    const t = w.time, cs = w.crystals, q = w.quiet;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (q && c.state >= 2) continue;
      c.x = c.ax + c.ox + c.Ax * Math.sin(c.wx * t + c.px);
      c.y = c.ay + c.oy + c.Ay * Math.sin(c.wy * t + c.py);
    }
  }
  function warp(w, tick) { w.tick = tick; w.time = tick * TICK; place(w); }
  function ev(w, e) { if (!w.quiet) w.events.push(e); }
  function addBloom(w, x, y, R, dur, depth, type) {
    w.blooms.push({ x, y, R, dur, t: 0, depth, type, rad: 0, noTouch: false, end: dur + HOLD, wither: false });
  }
  function burst(w, c, d) {
    c.state = 2; c.depth = d; c.t0 = w.time;
    w.count++; w.chain++;
    if (w.chain > w.maxChain) w.maxChain = w.chain;
    const m = mult(w.chain), pts = Math.round(25 * m);
    w.score += pts;
    const T = TY[c.type];
    addBloom(w, c.x, c.y, T.R, T.dur, d, c.type);
    if (c.type === "s") {
      for (let k = 0; k < 3; k++) {
        const a = c.id * 2.399 + (k * Math.PI * 2) / 3, sp = 70 + 14 * k;
        w.seeds.push({ x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, delay: 1.0 + k * 0.14, depth: d + 1 });
      }
    }
    ev(w, { k: "bloom", id: c.id, x: c.x, y: c.y, type: c.type, depth: d, note: w.noteIdx, pts, chain: w.chain, mult: m });
    w.noteIdx++;
    if (!w.goalHit && w.level.goal && w.count >= w.level.goal) { w.goalHit = true; ev(w, { k: "goal" }); }
  }
  function touch(w, c, b) {
    const d = b.depth + 1;
    switch (c.type) {
      case "t":
        c.state = 3; c.t0 = w.time; w.chain = 0; w.breaks++; b.noTouch = true; b.wither = true; b.end = b.t + 0.25;
        ev(w, { k: "thorn", id: c.id, x: c.x, y: c.y });
        return;
      case "b":
        if (w.chain >= LATE) { burst(w, c, d); ev(w, { k: "boom", x: c.x, y: c.y }); }
        else {
          c.state = 3; c.t0 = w.time; w.chain = 0; w.breaks++; b.noTouch = true; b.wither = true; b.end = b.t + 0.25;
          ev(w, { k: "dud", id: c.id, x: c.x, y: c.y });
        }
        return;
      case "i":
        c.state = 1; c.timer = c.timer0 = TY.i.delay; c.depth = d; c.t0 = w.time; ev(w, { k: "freeze", id: c.id, x: c.x, y: c.y });
        return;
      case "m":
        c.state = 1; c.timer = c.timer0 = TY.m.charge; c.depth = d; c.t0 = w.time; ev(w, { k: "charge", id: c.id, x: c.x, y: c.y });
        return;
      default:
        burst(w, c, d);
    }
  }
  function step(w) {
    const dt = TICK, cs = w.crystals;
    w.time += dt; w.tick++;
    place(w);
    const bl = w.blooms;
    for (let bi = 0; bi < bl.length; bi++) {
      const b = bl[bi];
      b.t += dt;
      if (b.noTouch || b.t > b.dur + HOLD) continue;
      b.rad = b.R * ease(Math.min(1, b.t / b.dur));
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i];
        if (c.state !== 0) continue;
        const dx = c.x - b.x, dy = c.y - b.y, rr = b.rad + TY[c.type].r;
        if (dx * dx + dy * dy <= rr * rr) { touch(w, c, b); if (b.noTouch) break; }
      }
    }
    // charging / frozen crystals
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (c.state !== 1) continue;
      c.timer -= dt;
      if (c.type === "m") {
        for (let j = 0; j < cs.length; j++) {
          const o = cs[j];
          if (o.state !== 0) continue;
          const dx = c.x - o.x, dy = c.y - o.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d < TY.m.pullR && d > 26) {
            const mv = Math.min(d - 24, 170 * dt * (1 - (d / TY.m.pullR) * 0.5));
            o.ox += (dx / d) * mv; o.oy += (dy / d) * mv;
          }
        }
      }
      if (c.timer <= 0) burst(w, c, c.depth);
    }
    // seeds
    const sd = w.seeds;
    for (let i = 0; i < sd.length; i++) {
      const s = sd[i];
      s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.985; s.vy *= 0.985;
      if (s.x < F.x0 - 10 || s.x > F.x1 + 10) s.vx = -s.vx;
      if (s.y < F.y0 - 10 || s.y > F.y1 + 10) s.vy = -s.vy;
      if (s.t >= s.delay) {
        s.done = true; w.chain++;
        if (w.chain > w.maxChain) w.maxChain = w.chain;
        const m = mult(w.chain), pts = Math.round(25 * m);
        w.score += pts;
        addBloom(w, s.x, s.y, 60, 0.75, s.depth, "s");
        ev(w, { k: "seed", x: s.x, y: s.y, depth: s.depth, note: w.noteIdx, pts, chain: w.chain, mult: m });
        w.noteIdx++;
      }
    }
    if (sd.length) w.seeds = sd.filter((s) => !s.done);
    if (bl.length) w.blooms = bl.filter((b) => b.t < b.end);
  }
  function isSettled(w) {
    if (w.lastTapTick < 0 || w.blooms.length || w.seeds.length) return false;
    for (let i = 0; i < w.crystals.length; i++) if (w.crystals[i].state === 1) return false;
    return true;
  }
  function tap(w, x, y) {
    if (w.tapsLeft <= 0) return false;
    w.tapsLeft--; w.lastTapTick = w.tick; w.chain = 0; w.noteIdx = 0;
    addBloom(w, x, y, SPARK.R, SPARK.dur, 0, "k");
    ev(w, { k: "spark", x, y });
    return true;
  }
  function runToSettle(w, max) {
    let n = 0;
    max = max || 2600;
    while (!isSettled(w) && n < max) { step(w); n++; }
  }
  function cloneWorld(w) {
    const n = Object.assign({}, w);
    n.crystals = w.crystals.map((c) => Object.assign({}, c));
    n.blooms = w.blooms.map((b) => Object.assign({}, b));
    n.seeds = w.seeds.map((s) => Object.assign({}, s));
    n.events = [];
    return n;
  }

  // ---------- solver ----------
  function makeGrid(stepPx, ox, oy) {
    const g = [];
    for (let y = F.y0 - 10 + (oy || 0); y <= F.y1 + 10; y += stepPx)
      for (let x = F.x0 - 10 + (ox || 0); x <= F.x1 + 10; x += stepPx) g.push([x, y]);
    return g;
  }
  function nearCrystal(w, x, y) {
    for (const c of w.crystals) {
      if (c.state !== 0) continue;
      const rr = SPARK.R + TY[c.type].r, dx = c.x - x, dy = c.y - y;
      if (dx * dx + dy * dy <= rr * rr) return true;
    }
    return false;
  }
  function solveLevel(level) {
    const grid = makeGrid(level.taps > 1 ? 36 : 28);
    const base = makeWorld(level);
    base.quiet = true;
    warp(base, TAP_TICK);
    let stage = [{ w: base, seq: [] }];
    let final = [];
    for (let k = 0; k < level.taps; k++) {
      const res = [];
      for (const st of stage) {
        for (const p of grid) {
          if (!nearCrystal(st.w, p[0], p[1])) continue;
          const w2 = cloneWorld(st.w);
          tap(w2, p[0], p[1]);
          const tk = st.w.tick;
          runToSettle(w2);
          res.push({ count: w2.count, score: w2.score, seq: st.seq.concat([{ x: p[0], y: p[1], tick: tk }]), w: w2 });
        }
      }
      for (const st of stage) res.push({ count: st.w.count, score: st.w.score, seq: st.seq, w: st.w, skip: true });
      res.sort((a, b) => b.count - a.count || b.score - a.score);
      if (k < level.taps - 1) {
        const beam = [];
        for (const r of res) {
          const last = r.seq[r.seq.length - 1];
          if (r.skip || beam.every((b) => !b.seq[k] || Math.hypot(b.seq[k].x - last.x, b.seq[k].y - last.y) > 44)) beam.push(r);
          if (beam.length >= 5) break;
        }
        stage = beam.map((r) => { warp(r.w, r.w.tick + 30); return { w: r.w, seq: r.seq }; });
        if (!stage.length) { final = []; break; }
      } else final = res;
    }
    const counts = final.map((r) => r.count);
    return { counts, best: counts.length ? counts[0] : 0, seq: final.length ? final[0].seq : [], all: final };
  }

  // ---------- layouts ----------
  function tryAdd(p, x, y, minD) {
    if (x < F.x0 || x > F.x1 || y < F.y0 || y > F.y1) return false;
    for (let i = 0; i < p.length; i++) { const dx = p[i][0] - x, dy = p[i][1] - y; if (dx * dx + dy * dy < minD * minD) return false; }
    p.push([x, y]);
    return true;
  }
  const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(6.2832 * r());
  function fill(r, p, n, minD) {
    let tries = 0;
    while (p.length < n && tries < 5000) { tries++; tryAdd(p, F.x0 + (F.x1 - F.x0) * r(), F.y0 + (F.y1 - F.y0) * r(), minD); }
    return p.slice(0, n);
  }
  const LAYOUTS = {
    scatter: (r, n, m) => fill(r, [], n, m),
    clusters(r, n, m) {
      const k = 3 + Math.floor(r() * 3), cs = [];
      for (let i = 0; i < k; i++) cs.push([F.x0 + 70 + (F.x1 - F.x0 - 140) * r(), F.y0 + 70 + (F.y1 - F.y0 - 140) * r()]);
      const p = []; let tries = 0;
      while (p.length < n * 0.85 && tries < 3000) { tries++; const c = cs[Math.floor(r() * k)]; tryAdd(p, c[0] + gauss(r) * 46, c[1] + gauss(r) * 46, m); }
      return fill(r, p, n, m);
    },
    rings(r, n, m) {
      const cx = 270 + (r() - 0.5) * 80, cy = 505 + (r() - 0.5) * 120, r1 = 62 + r() * 24, r2 = r1 + 68 + r() * 22, r3 = r2 + 72;
      const p = []; tryAdd(p, cx, cy, m);
      const ring = (rad, cnt) => { const a0 = r() * 6.283; for (let i = 0; i < cnt; i++) { const a = a0 + (i * 6.283) / cnt; tryAdd(p, cx + Math.cos(a) * rad * (1 + (r() - 0.5) * 0.08), cy + Math.sin(a) * rad * (1 + (r() - 0.5) * 0.08), m); } };
      ring(r1, Math.max(4, Math.round(n * 0.22))); ring(r2, Math.round(n * 0.33)); ring(r3, Math.round(n * 0.4));
      return fill(r, p, n, m);
    },
    spiral(r, n, m) {
      const cx = 270, cy = 505, dir = r() < 0.5 ? 1 : -1, a = r() * 6.28, p = [];
      let th = 0.5 + r() * 2;
      for (let k = 0; k < 500 && p.length < n; k++) {
        const rad = 26 + th * 15;
        tryAdd(p, cx + Math.cos(dir * th + a) * rad, cy + Math.sin(dir * th + a) * rad * 1.3, m);
        th += 60 / rad;
      }
      return fill(r, p, n, m);
    },
    lanes(r, n, m) {
      const p = [], lanes = 2 + Math.floor(r() * 2);
      for (let l = 0; l < lanes; l++) {
        const x0 = F.x0 + (F.x1 - F.x0) * r(), y0 = F.y0 + (F.y1 - F.y0) * r(), an = r() * Math.PI, cs = Math.cos(an), sn = Math.sin(an), am = 20 + r() * 30, fq = 0.01 + r() * 0.01;
        for (let s = -560; s <= 560; s += 60) {
          const off = am * Math.sin(s * fq * 3);
          tryAdd(p, x0 + cs * s - sn * off + (r() - 0.5) * 12, y0 + sn * s + cs * off + (r() - 0.5) * 12, m);
        }
      }
      return fill(r, p.slice(0, n), n, m);
    },
    islands(r, n, m) {
      const k = 3, cs = []; let tries = 0;
      while (cs.length < k && tries < 400) {
        tries++; const c = [F.x0 + 60 + (F.x1 - F.x0 - 120) * r(), F.y0 + 60 + (F.y1 - F.y0 - 120) * r()];
        if (cs.every((o) => Math.hypot(o[0] - c[0], o[1] - c[1]) > 230)) cs.push(c);
      }
      const p = []; tries = 0;
      while (p.length < n * 0.8 && tries < 3000 && cs.length) { tries++; const c = cs[Math.floor(r() * cs.length)]; tryAdd(p, c[0] + gauss(r) * 36, c[1] + gauss(r) * 36, m); }
      return fill(r, p, n, m);
    },
  };
  const LAYOUT_KEYS = ["scatter", "clusters", "rings", "spiral", "lanes", "islands"];

  const PACKS = ["Dewdrop Shallows", "Moonlit Reeds", "Starlotus Deep", "Aurora Heart"];
  const ADJ = ["Quiet", "Silver", "Drifting", "Whispering", "Glass", "Velvet", "Amber", "Hidden", "Gentle", "Lantern", "Cobalt", "Misty", "Opal", "Twilight", "Sleeping", "Jade"];
  const NOUN = ["Ripple", "Reeds", "Lotus", "Basin", "Bend", "Hollow", "Terrace", "Glade", "Eddy", "Lagoon", "Shore", "Garden", "Crossing", "Spring", "Cove", "Isle"];

  function params(e) {
    return {
      n: Math.max(12, Math.min(46, Math.round(12 + e * 0.78))),
      thorns: e < 3 ? 0 : Math.min(1 + Math.floor((e - 3) / 5), 6),
      bombs: e < 7 ? 0 : Math.min(1 + Math.floor((e - 7) / 6), 4),
      sf: Math.min(0.4, 0.1 + 0.012 * e),
    };
  }
  function buildLayout(index, e, seedBase, attempt, taps) {
    const r = rng(hash(seedBase, attempt * 7919 + 13));
    const P = params(e);
    let n = P.n; if (taps > 1) n = Math.min(50, Math.round(n * 1.2));
    const keys = e < 2 ? ["scatter", "clusters"] : LAYOUT_KEYS;
    const key = keys[Math.floor(r() * keys.length)];
    const minD = e < 4 ? 52 : 46;
    const pts = LAYOUTS[key](r, n, minD);
    const N = pts.length;
    const deg = pts.map((a, i) => { let d = 0; for (let j = 0; j < N; j++) if (j !== i && Math.hypot(a[0] - pts[j][0], a[1] - pts[j][1]) < 105) d++; return d; });
    const order = pts.map((_, i) => i).sort((a, b) => deg[b] + r() * 2.2 - (deg[a] + r() * 2.2));
    const types = new Array(N).fill("n");
    const free = order.slice();
    const takeHub = () => { const k = Math.floor(r() * Math.max(1, free.length * 0.55)); return free.splice(k, 1)[0]; };
    const takeAny = () => free.splice(Math.floor(r() * free.length), 1)[0];
    const takeEdge = () => free.splice(free.length - 1 - Math.floor(r() * Math.max(1, free.length * 0.5)), 1)[0];
    for (let i = 0; i < P.thorns; i++) if (free.length > 6) types[takeHub()] = "t";
    for (let i = 0; i < P.bombs; i++) if (free.length > 6) types[takeAny()] = "b";
    const unlock = { p: 2, i: 4, m: 5, s: 6 };
    const avail = Object.keys(unlock).filter((k) => e >= unlock[k]);
    if (avail.length) {
      const total = Math.round(N * P.sf);
      const list = [];
      for (const k of avail) if (unlock[k] === e) list.push(k, k);
      while (list.length < total) list.push(avail[Math.floor(r() * avail.length)]);
      for (const k of list) { if (free.length < 3) break; types[k === "p" ? takeEdge() : takeAny()] = k; }
    }
    const A = e < 3 ? 5 : 7;
    const crystals = pts.map((p, i) => {
      const amp = A + r() * (e < 3 ? 6 : 13);
      return {
        type: types[i], ax: p[0], ay: p[1], Ax: amp * (0.6 + r() * 0.8), Ay: amp * (0.6 + r() * 0.8),
        wx: 0.28 + r() * 0.4, wy: 0.28 + r() * 0.4, px: r() * 6.283, py: r() * 6.283,
        hue: 178 + Math.floor(r() * 120), rot: r() * 6.283,
      };
    });
    return { crystals, key };
  }

  function genLevel(index, opts) {
    opts = opts || {};
    const e = opts.e != null ? opts.e : index;
    const seedBase = opts.seed != null ? opts.seed : hash(0xc0ffee, index);
    let taps = 1;
    if (!opts.oneTap) {
      if (e >= 9 && e % 5 === 4) taps = 2;
      if (e >= 19 && e % 10 === 9) taps = 3;
    }
    const frac = e === 0 ? 0.42 : e === 1 ? 0.34 : e === 2 ? 0.27 : Math.max(0.03, 0.22 - e * 0.0055);
    let bestLv = null;
    for (let att = 0; att < 7; att++) {
      const lay = buildLayout(index, e, seedBase, att, taps);
      const lv = { index, e, taps, crystals: lay.crystals, layout: lay.key, seed: seedBase, goal: 0 };
      const M = lv.crystals.filter((c) => c.type !== "t").length;
      lv.M = M;
      const sol = solveLevel(lv);
      const B = sol.best;
      const counts = sol.counts;
      let goal = 1;
      if (counts.length) {
        if (taps > 1) goal = Math.max(counts[Math.min(5, counts.length - 1)], Math.round(B * 0.9));
        else goal = counts[Math.min(counts.length, Math.max(3, Math.round(counts.length * frac))) - 1];
        goal = Math.max(goal, Math.round(B * 0.4));
      }
      goal = Math.max(1, Math.min(goal, B || 1));
      lv.best = B; lv.goal = goal;
      lv.hits = counts.filter((c) => c >= goal).length;
      lv.total = counts.length;
      const s2 = Math.min(B, Math.max(goal + 1, Math.round(goal + (B - goal) * 0.4)));
      const s3 = Math.min(B, Math.max(s2, Math.round(goal + (B - goal) * 0.8)));
      lv.s2 = Math.max(goal, s2); lv.s3 = Math.max(lv.s2, s3);
      lv.hint = sol.seq.slice();
      lv.attempt = att;
      lv.quality = goal / M;
      lv.name = ADJ[hash(seedBase, 3) % ADJ.length] + " " + NOUN[hash(seedBase, 5) % NOUN.length];
      if (!bestLv || lv.quality > bestLv.quality) bestLv = lv;
      const need = e < 6 ? 0.4 : 0.36;
      if (lv.quality >= need && goal >= Math.min(4, M - 1) && B >= 0.55 * M * (e > 12 ? 0.85 : 1)) { bestLv = lv; break; }
    }
    return bestLv;
  }

  root.CB = {
    W, H, TICK, F, TY, SPARK, LATE, HOLD, TAP_TICK, PACKS, mult, rng, hash, ease,
    makeWorld, step, tap, isSettled, runToSettle, cloneWorld, warp, place, solveLevel, genLevel, nearCrystal,
  };
})(typeof window !== "undefined" ? window : globalThis);
