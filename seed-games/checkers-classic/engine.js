// Checkers Classic engine — pure rules + AI. No DOM. English/American draughts.
// Board: 64 squares, index = row*8+col, dark squares are (row+col)%2===1.
// Pieces: 1 black man, 2 black king, -1 red man, -2 red king. Black starts at the top (rows 0-2) and moves first.
(function (root) {
  "use strict";
  const BLACK = 1, RED = -1;
  const DRAW_PLIES = 80; // 40 moves each without a capture or a man move

  function initialBoard() {
    const b = new Int8Array(64);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 !== 1) continue;
      if (r < 3) b[r * 8 + c] = 1; else if (r > 4) b[r * 8 + c] = -1;
    }
    return b;
  }

  // ---- zobrist hashing (two 32-bit halves) ----
  function mulberry(seed) { return function () { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0); }; }
  const rz = mulberry(20240607);
  const Z1 = new Int32Array(64 * 4), Z2 = new Int32Array(64 * 4);
  for (let i = 0; i < Z1.length; i++) { Z1[i] = rz() | 0; Z2[i] = rz() | 0; }
  const T1 = rz() | 0, T2 = rz() | 0;
  const pidx = (p) => (p === 1 ? 0 : p === 2 ? 1 : p === -1 ? 2 : 3);
  function computeHash(s) {
    let h1 = 0, h2 = 0;
    for (let i = 0; i < 64; i++) { const p = s.b[i]; if (p) { const k = i * 4 + pidx(p); h1 ^= Z1[k]; h2 ^= Z2[k]; } }
    if (s.turn === RED) { h1 ^= T1; h2 ^= T2; }
    s.h1 = h1; s.h2 = h2; return s;
  }
  const keyOf = (s) => (s.h1 >>> 0) * 1048576 + (s.h2 & 0xFFFFF);

  function newState(board, turn) {
    return computeHash({ b: board ? Int8Array.from(board) : initialBoard(), turn: turn || BLACK, half: 0, h1: 0, h2: 0 });
  }
  // Build a state from 8 strings: '.' empty, b/B black man/king, r/R red man/king.
  function fromRows(rows, turn) {
    const b = new Int8Array(64);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const ch = rows[r][c]; b[r * 8 + c] = ch === "b" ? 1 : ch === "B" ? 2 : ch === "r" ? -1 : ch === "R" ? -2 : 0;
    }
    return newState(b, turn || BLACK);
  }
  function toRows(s) {
    const ch = { 0: ".", 1: "b", 2: "B", "-1": "r", "-2": "R" }, out = [];
    for (let r = 0; r < 8; r++) { let line = ""; for (let c = 0; c < 8; c++) line += ch[s.b[r * 8 + c]]; out.push(line); }
    return out;
  }

  const DN = [[1, -1], [1, 1]], UP = [[-1, -1], [-1, 1]], ALL = [[1, -1], [1, 1], [-1, -1], [-1, 1]];
  const dirsOf = (p) => (p === 2 || p === -2 ? ALL : p === 1 ? DN : UP);

  function jumpsFrom(b, sq, p, side, path, caps, out) {
    const r = sq >> 3, c = sq & 7, ds = dirsOf(p), promoRow = side === BLACK ? 7 : 0;
    let found = false;
    for (let i = 0; i < ds.length; i++) {
      const dr = ds[i][0], dc = ds[i][1], r2 = r + 2 * dr, c2 = c + 2 * dc;
      if (r2 < 0 || r2 > 7 || c2 < 0 || c2 > 7) continue;
      const mid = (r + dr) * 8 + c + dc, land = r2 * 8 + c2, mp = b[mid];
      if (mp * side < 0 && b[land] === 0) {
        found = true;
        b[mid] = 0; path.push(land); caps.push(mid);
        if ((p === 1 || p === -1) && r2 === promoRow) out.push({ from: path[0], to: land, path: path.slice(), caps: caps.slice(), promo: true });
        else jumpsFrom(b, land, p, side, path, caps, out);
        path.pop(); caps.pop(); b[mid] = mp;
      }
    }
    if (!found && path.length > 1) out.push({ from: path[0], to: sq, path: path.slice(), caps: caps.slice(), promo: false });
  }

  // Legal moves (full jump chains). If any capture exists, only captures are returned.
  function genMoves(s) {
    const b = s.b, side = s.turn, out = [];
    for (let sq = 0; sq < 64; sq++) {
      const p = b[sq];
      if (p * side <= 0) continue;
      b[sq] = 0;
      jumpsFrom(b, sq, p, side, [sq], [], out);
      b[sq] = p;
    }
    if (out.length) return out;
    const promoRow = side === BLACK ? 7 : 0;
    for (let sq = 0; sq < 64; sq++) {
      const p = b[sq];
      if (p * side <= 0) continue;
      const r = sq >> 3, c = sq & 7, ds = dirsOf(p);
      for (let i = 0; i < ds.length; i++) {
        const r2 = r + ds[i][0], c2 = c + ds[i][1];
        if (r2 < 0 || r2 > 7 || c2 < 0 || c2 > 7) continue;
        const to = r2 * 8 + c2;
        if (b[to] === 0) out.push({ from: sq, to, path: [sq, to], caps: [], promo: (p === 1 || p === -1) && r2 === promoRow });
      }
    }
    return out;
  }

  function applyMove(s, m) {
    const b = Int8Array.from(s.b);
    let h1 = s.h1, h2 = s.h2;
    let p = b[m.from];
    const wasMan = p === 1 || p === -1;
    let k = m.from * 4 + pidx(p); h1 ^= Z1[k]; h2 ^= Z2[k]; b[m.from] = 0;
    for (let i = 0; i < m.caps.length; i++) { const q = m.caps[i]; k = q * 4 + pidx(b[q]); h1 ^= Z1[k]; h2 ^= Z2[k]; b[q] = 0; }
    if (m.promo) p = p * 2;
    b[m.to] = p; k = m.to * 4 + pidx(p); h1 ^= Z1[k]; h2 ^= Z2[k];
    h1 ^= T1; h2 ^= T2;
    return { b, turn: -s.turn, half: m.caps.length || wasMan ? 0 : s.half + 1, h1, h2 };
  }

  function sameMove(a, b) { return a.path.length === b.path.length && a.path.every((v, i) => v === b.path[i]); }

  function counts(s) {
    const o = { black: 0, red: 0, blackKings: 0, redKings: 0 };
    for (let i = 0; i < 64; i++) { const p = s.b[i]; if (p > 0) { o.black++; if (p === 2) o.blackKings++; } else if (p < 0) { o.red++; if (p === -2) o.redKings++; } }
    return o;
  }

  // hashes: array of keyOf() values for positions reached in the game (including current). Returns result object.
  function gameResult(s, hashes, moves) {
    moves = moves || genMoves(s);
    if (!moves.length) return { over: true, winner: -s.turn, reason: "blocked" };
    if (s.half >= DRAW_PLIES) return { over: true, winner: 0, reason: "40-move rule" };
    if (hashes) { let n = 0; const k = keyOf(s); for (const h of hashes) if (h === k) n++; if (n >= 3) return { over: true, winner: 0, reason: "repetition" }; }
    return { over: false };
  }

  function perft(s, depth) {
    if (depth === 0) return 1;
    const ms = genMoves(s);
    if (depth === 1) return ms.length;
    let n = 0;
    for (const m of ms) n += perft(applyMove(s, m), depth - 1);
    return n;
  }

  // ---- evaluation (positive = good for black) ----
  function evaluate(s) {
    const b = s.b;
    let score = 0, nb = 0, nr = 0, kb = 0, kr = 0, bs = [], rs = [];
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p) continue;
      const r = i >> 3, c = i & 7, cen = 3.5 - Math.abs(c - 3.5), cenR = 3.5 - Math.abs(r - 3.5);
      if (p === 1) { nb++; score += 100 + r * r * 0.9 + (r === 6 ? 6 : 0) + cen * 1.5 + (c === 0 || c === 7 ? -3 : 0) + (r === 0 ? 7 : 0); bs.push(i); }
      else if (p === -1) { nr++; score -= 100 + (7 - r) * (7 - r) * 0.9 + (r === 1 ? 6 : 0) + cen * 1.5 + (c === 0 || c === 7 ? -3 : 0) + (r === 7 ? 7 : 0); rs.push(i); }
      else if (p === 2) { nb++; kb++; score += 165 + cen * 3 + cenR * 3; bs.push(i); }
      else { nr++; kr++; score -= 165 + cen * 3 + cenR * 3; rs.push(i); }
    }
    const tot = nb + nr;
    // trade down when ahead
    score += ((nb - nr) * 24 * 12) / Math.max(4, tot);
    // endgame: winner closes in on the opponent's pieces, defender keeps to the long diagonal
    if (tot <= 8 && nb !== nr) {
      const ahead = nb > nr ? 1 : -1, hunters = ahead === 1 ? bs : rs, prey = ahead === 1 ? rs : bs;
      let d = 0;
      for (const h of hunters) { let best = 99; for (const q of prey) best = Math.min(best, Math.abs((h >> 3) - (q >> 3)) + Math.abs((h & 7) - (q & 7))); d += best; }
      score += ahead * -(d / Math.max(1, hunters.length)) * 4;
    }
    return score;
  }

  // ---- search ----
  const INF = 1e6, WIN = 1e5, TIMEOUT = { timeout: true };
  const LEVELS = [
    { id: 0, name: "Easy", depth: 2, ms: 150, noise: 45, blunder: 0.22, minThink: 450 },
    { id: 1, name: "Medium", depth: 4, ms: 300, noise: 14, blunder: 0.04, minThink: 450 },
    { id: 2, name: "Hard", depth: 9, ms: 900, noise: 0, blunder: 0, minThink: 300 },
    { id: 3, name: "Master", depth: 40, ms: 2200, noise: 0, blunder: 0, minThink: 300 },
  ];

  function makeSearch(cfg, history) {
    const tt = new Map();
    let nodes = 0, deadline = Infinity;
    const hist = history || [];

    function order(ms, ttMove) {
      const sc = ms.map((m, i) => ({ m, v: (ttMove && sameMove(m, ttMove) ? 1000 : 0) + m.caps.length * 10 + (m.promo ? 5 : 0) }));
      sc.sort((a, b) => b.v - a.v);
      return sc.map((x) => x.m);
    }
    function ab(s, depth, alpha, beta, ply) {
      if ((++nodes & 1023) === 0 && Date.now() > deadline) throw TIMEOUT;
      if (s.half >= DRAW_PLIES) return 0;
      const ms = genMoves(s);
      if (!ms.length) return -WIN + ply;
      if (depth <= 0) {
        if (ms[0].caps.length && ply < 60) depth = 1; // don't stop in the middle of a forced exchange
        else return evaluate(s) * s.turn;
      }
      const key = keyOf(s), e = tt.get(key);
      let ttMove = null;
      if (e) {
        ttMove = e.m;
        if (e.d >= depth) {
          if (e.f === 0) return e.v;
          if (e.f === 1 && e.v >= beta) return e.v;
          if (e.f === 2 && e.v <= alpha) return e.v;
        }
      }
      const a0 = alpha;
      let best = -INF, bm = null;
      const sorted = order(ms, ttMove);
      for (let i = 0; i < sorted.length; i++) {
        const m = sorted[i];
        const v = -ab(applyMove(s, m), depth - 1, -beta, -alpha, ply + 1);
        if (v > best) { best = v; bm = m; }
        if (v > alpha) alpha = v;
        if (alpha >= beta) break;
      }
      tt.set(key, { d: depth, v: best, f: best <= a0 ? 2 : best >= beta ? 1 : 0, m: bm });
      if (tt.size > 400000) tt.clear();
      return best;
    }
    // ply-1 search as a generator so the driver can yield between subtrees
    function* ply1(s, depth, alpha, beta) {
      const ms = genMoves(s);
      if (!ms.length) return -WIN + 1;
      if (depth <= 0 && !ms[0].caps.length) return evaluate(s) * s.turn;
      const sorted = order(ms, null);
      let best = -INF;
      for (const m of sorted) {
        const v = -ab(applyMove(s, m), Math.max(depth, 1) - 1, -beta, -alpha, 2);
        if (v > best) best = v;
        if (v > alpha) alpha = v;
        if (alpha >= beta) break;
        yield;
      }
      return best;
    }
    function* run(s) {
      const moves = genMoves(s);
      if (!moves.length) return null;
      if (moves.length === 1) return { move: moves[0], depth: 0, score: 0 };
      const start = Date.now();
      deadline = start + cfg.ms;
      let ordered = order(moves, null), scores = new Map(), bestMove = ordered[0], reached = 0, bestScore = 0;
      const exact = cfg.noise > 0;
      for (let depth = 1; depth <= cfg.depth; depth++) {
        const iter = [];
        let alpha = -INF;
        try {
          for (const m of ordered) {
            const child = applyMove(s, m);
            const rep = hist.reduce((n, h) => n + (h === keyOf(child) ? 1 : 0), 0);
            const pen = rep && evaluate(s) * s.turn > 40 ? 35 * rep : 0;
            const v = -(yield* ply1(child, depth - 1, exact ? -INF : -INF, exact ? INF : -alpha)) - pen;
            iter.push({ m, v });
            if (v > alpha) alpha = v;
            yield;
          }
        } catch (e) {
          if (e !== TIMEOUT) throw e;
          // keep a partially searched iteration only if its best-so-far beats nothing better (safe: ignore)
          break;
        }
        iter.sort((a, b) => b.v - a.v);
        ordered = iter.map((x) => x.m);
        scores = new Map(iter.map((x) => [x.m, x.v]));
        bestMove = iter[0].m; bestScore = iter[0].v; reached = depth;
        if (Math.abs(bestScore) > WIN - 100 || Date.now() > start + cfg.ms * 0.85) break;
      }
      let choice = bestMove;
      if (cfg.blunder && Math.random() < cfg.blunder) choice = moves[(Math.random() * moves.length) | 0];
      else if (cfg.noise && scores.size) {
        let bv = -INF;
        for (const [m, v] of scores) { const nv = v + (Math.random() - 0.5) * 2 * cfg.noise; if (nv > bv) { bv = nv; choice = m; } }
      }
      return { move: choice, depth: reached, score: bestScore };
    }
    return run;
  }

  function levelCfg(level) { return typeof level === "number" ? LEVELS[Math.max(0, Math.min(3, level))] : level; }
  function chooseMoveSync(s, level, history) {
    const g = makeSearch(levelCfg(level), history)(s);
    let r; while (!(r = g.next()).done);
    return r.value;
  }
  // Sliced so the UI thread stays responsive. cb(result) is called once.
  function chooseMoveAsync(s, level, history, cb, opts) {
    const cfg = levelCfg(level), g = makeSearch(cfg, history)(s), t0 = Date.now();
    let cancelled = false;
    const isPaused = (opts && opts.isPaused) || (() => false);
    function slice() {
      if (cancelled) return;
      if (isPaused()) { setTimeout(slice, 100); return; }
      const end = Date.now() + 10;
      let r;
      do { r = g.next(); } while (!r.done && Date.now() < end);
      if (!r.done) { setTimeout(slice, 0); return; }
      const wait = Math.max(0, (cfg.minThink || 0) - (Date.now() - t0));
      setTimeout(() => { if (!cancelled) cb(r.value); }, wait);
    }
    setTimeout(slice, 0);
    return () => { cancelled = true; };
  }

  const API = { BLACK, RED, DRAW_PLIES, LEVELS, initialBoard, newState, fromRows, toRows, genMoves, applyMove, sameMove, counts, gameResult, perft, evaluate, keyOf, chooseMoveSync, chooseMoveAsync };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.CheckersEngine = API;
})(typeof window !== "undefined" ? window : globalThis);
