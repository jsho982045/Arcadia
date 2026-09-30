// Backgammon engine: pure rules + AI. No DOM. Works in node (module.exports) and in the browser (window.BG).
(function () {
  'use strict';
  // Board: pts[0..23]; player 0 (white) = positive counts and moves 23 -> 0 (home idx 0-5);
  // player 1 (black) = negative counts and moves 0 -> 23 (home idx 18-23).
  // Move: {f: 0..23 | 24 (bar), t: 0..23 | 25 (off), d: die, hit: bool}
  const BAR = 24, OFF = 25;

  function newState() {
    const pts = new Array(24).fill(0);
    pts[23] = 2; pts[12] = 5; pts[7] = 3; pts[5] = 5;
    pts[0] = -2; pts[11] = -5; pts[16] = -3; pts[18] = -5;
    return { pts, bar: [0, 0], off: [0, 0] };
  }
  function clone(s) { return { pts: s.pts.slice(), bar: s.bar.slice(), off: s.off.slice() }; }
  function key(s) { return s.pts.join(',') + '|' + s.bar[0] + ',' + s.bar[1] + '|' + s.off[0] + ',' + s.off[1]; }
  const sgn = (p) => (p === 0 ? 1 : -1);
  // point number as seen by player p (1 = their last point, 24 = furthest)
  function pointNo(p, idx) { return p === 0 ? idx + 1 : 24 - idx; }
  function pips(s, p) {
    let n = s.bar[p] * 25;
    for (let i = 0; i < 24; i++) { const c = s.pts[i] * sgn(p); if (c > 0) n += c * pointNo(p, i); }
    return n;
  }
  function allHome(s, p) {
    if (s.bar[p] > 0) return false;
    const g = sgn(p);
    if (p === 0) { for (let i = 6; i < 24; i++) if (s.pts[i] * g > 0) return false; }
    else { for (let i = 0; i < 18; i++) if (s.pts[i] * g > 0) return false; }
    return true;
  }
  function checkerCount(s, p) {
    let n = s.bar[p] + s.off[p];
    for (let i = 0; i < 24; i++) { const c = s.pts[i] * sgn(p); if (c > 0) n += c; }
    return n;
  }

  function singleMoves(s, p, die) {
    const g = sgn(p), dir = p === 0 ? -1 : 1, res = [];
    if (s.bar[p] > 0) {
      const t = p === 0 ? 24 - die : die - 1;
      const oc = -s.pts[t] * g;
      if (oc < 2) res.push({ f: BAR, t, d: die, hit: oc === 1 });
      return res;
    }
    const home = allHome(s, p);
    let farthest = -1; // idx of farthest own checker (for higher-die bear off)
    if (home) {
      if (p === 0) { for (let i = 5; i >= 0; i--) if (s.pts[i] > 0) { farthest = i; break; } }
      else { for (let i = 18; i < 24; i++) if (s.pts[i] < 0) { farthest = i; break; } }
    }
    for (let i = 0; i < 24; i++) {
      if (s.pts[i] * g <= 0) continue;
      const t = i + dir * die;
      if (t >= 0 && t <= 23) {
        const oc = -s.pts[t] * g;
        if (oc < 2) res.push({ f: i, t, d: die, hit: oc === 1 });
      } else if (home) {
        const dist = pointNo(p, i);
        if (die === dist || (die > dist && i === farthest)) res.push({ f: i, t: OFF, d: die, hit: false });
      }
    }
    return res;
  }
  function applyMove(s, p, m) {
    const n = clone(s), g = sgn(p);
    if (m.f === BAR) n.bar[p]--; else n.pts[m.f] -= g;
    if (m.t === OFF) n.off[p]++;
    else {
      if (n.pts[m.t] * g < 0) { n.pts[m.t] = 0; n.bar[1 - p]++; }
      n.pts[m.t] += g;
    }
    return n;
  }
  function removeDie(dice, i) { const r = dice.slice(); r.splice(i, 1); return r; }
  function maxPlay(s, p, dice) {
    if (!dice.length) return 0;
    let best = 0; const seen = {};
    for (let i = 0; i < dice.length; i++) {
      const d = dice[i]; if (seen[d]) continue; seen[d] = 1;
      const rest = removeDie(dice, i), ms = singleMoves(s, p, d);
      for (const m of ms) {
        const v = 1 + maxPlay(applyMove(s, p, m), p, rest);
        if (v > best) best = v;
        if (best === dice.length) return best;
      }
    }
    return best;
  }
  // Legal next single moves given the remaining dice. maxLen = max dice usable at turn start, played = moves made so far.
  function legalMoves(s, p, dice, maxLen, played) {
    const need = maxLen - played;
    if (need <= 0 || !dice.length) return [];
    let res = []; const seen = {};
    for (let i = 0; i < dice.length; i++) {
      const d = dice[i]; if (seen[d]) continue; seen[d] = 1;
      const rest = removeDie(dice, i);
      for (const m of singleMoves(s, p, d)) {
        if (need === 1 || 1 + maxPlay(applyMove(s, p, m), p, rest) >= need) res.push(m);
      }
    }
    if (played === 0 && maxLen === 1 && dice.length === 2 && dice[0] !== dice[1]) {
      const big = Math.max(dice[0], dice[1]);
      const bigMoves = res.filter((m) => m.d === big);
      if (bigMoves.length) res = bigMoves;
    }
    return res;
  }
  function turnDice(dice) { return dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [dice[0], dice[1]]; }
  function remainingDice(dice, moves) {
    const r = turnDice(dice);
    for (const m of moves) { const i = r.indexOf(m.d); if (i >= 0) r.splice(i, 1); }
    return r;
  }

  // Every maximal play (deduplicated by resulting position): [{moves, state}]
  function genPlays(s, p, dice) {
    const orders = dice[0] === dice[1] ? [turnDice(dice)] : [[dice[0], dice[1]], [dice[1], dice[0]]];
    const finals = new Map(); let maxLen = 0;
    for (const order of orders) {
      let level = new Map(); level.set(key(s), { state: s, moves: [] });
      for (let i = 0; i <= order.length; i++) {
        if (i === order.length) { for (const [k, e] of level) addFinal(k, e, i); break; }
        const next = new Map();
        for (const [k, e] of level) {
          const ms = singleMoves(e.state, p, order[i]);
          if (!ms.length) { addFinal(k, e, i); continue; }
          for (const m of ms) {
            const ns = applyMove(e.state, p, m), nk = key(ns);
            if (!next.has(nk)) next.set(nk, { state: ns, moves: e.moves.concat([m]) });
          }
        }
        level = next;
        if (!level.size) break;
      }
    }
    function addFinal(k, e, len) {
      if (len > maxLen) { maxLen = len; finals.clear(); }
      if (len === maxLen && !finals.has(k)) finals.set(k, e);
    }
    let out = [...finals.values()];
    if (maxLen === 0) return [];
    if (maxLen === 1 && dice[0] !== dice[1]) {
      const big = Math.max(dice[0], dice[1]);
      const bm = singleMoves(s, p, big);
      if (bm.length) {
        const seen = new Map();
        for (const m of bm) { const ns = applyMove(s, p, m), k = key(ns); if (!seen.has(k)) seen.set(k, { state: ns, moves: [m] }); }
        out = [...seen.values()];
      }
    }
    return out;
  }

  function winner(s) { return s.off[0] === 15 ? 0 : s.off[1] === 15 ? 1 : -1; }
  // Points multiplier for a finished game (1 single, 2 gammon, 3 backgammon)
  function gameResult(s) {
    const w = winner(s); if (w < 0) return null;
    const l = 1 - w;
    let mult = 1;
    if (s.off[l] === 0) {
      mult = 2;
      let bg = s.bar[l] > 0;
      if (!bg) {
        // loser has checker in winner's home board
        if (w === 0) { for (let i = 0; i < 6; i++) if (s.pts[i] < 0) bg = true; }
        else { for (let i = 18; i < 24; i++) if (s.pts[i] > 0) bg = true; }
      }
      if (bg) mult = 3;
    }
    return { winner: w, mult, kind: mult === 3 ? 'backgammon' : mult === 2 ? 'gammon' : 'single' };
  }

  // ---------- dice ----------
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function seedRng() {
    let seed = (Date.now() ^ ((Math.random() * 4294967296) >>> 0)) >>> 0;
    try { if (typeof crypto !== 'undefined' && crypto.getRandomValues) { const a = new Uint32Array(1); crypto.getRandomValues(a); seed ^= a[0]; } } catch (e) {}
    return makeRng(seed);
  }
  let defaultRng = seedRng();
  function rollDie(rng) { return 1 + Math.floor((rng || defaultRng)() * 6); }
  function rollDice(rng) { return [rollDie(rng), rollDie(rng)]; }
  function openingRoll(rng) { let a, b; do { a = rollDie(rng); b = rollDie(rng); } while (a === b); return { dice: [a, b], first: a > b ? 0 : 1 }; }

  // ---------- evaluation ----------
  const SHOT = [0, 11, 12, 14, 15, 15, 17, 6, 6, 5, 3, 2, 3].map((x) => x / 36);
  const HOME_W = [0, 3, 4, 6, 8, 9, 7]; // by point number 1..6
  function hasContact(s) {
    let max0 = -1, min1 = 99;
    if (s.bar[0] > 0) max0 = 24; else for (let i = 23; i >= 0; i--) if (s.pts[i] > 0) { max0 = i; break; }
    if (s.bar[1] > 0) min1 = -1; else for (let i = 0; i < 24; i++) if (s.pts[i] < 0) { min1 = i; break; }
    return max0 > min1;
  }
  function side(s, p) {
    const g = sgn(p), q = 1 - p, pip = pips(s, p);
    let sc = -pip;
    if (!hasContact(s)) return sc;
    // opponent checker positions (bar as virtual point)
    const oppPos = [];
    for (let i = 0; i < 24; i++) if (s.pts[i] * g < 0) oppPos.push(i);
    if (s.bar[q] > 0) oppPos.push(q === 0 ? 24 : -1);
    let run = 0, best = 0;
    const order = []; for (let n = 1; n <= 24; n++) order.push(p === 0 ? n - 1 : 24 - n);
    for (let n = 1; n <= 24; n++) {
      const idx = order[n - 1], c = s.pts[idx] * g;
      if (c >= 2) {
        run++; if (run > best) best = run;
        sc += n <= 6 ? HOME_W[n] : n <= 12 ? (n === 7 ? 6 : 3) : n >= 19 && n <= 21 ? 5 : 2;
        if (c > 4) sc -= (c - 4) * 2;
      } else run = 0;
      if (c === 1) {
        let miss = 1;
        for (const o of oppPos) {
          const dist = q === 0 ? o - idx : idx - o;
          if (dist >= 1 && dist <= 12) miss *= 1 - SHOT[dist];
        }
        const pHit = 1 - miss;
        const opBarBonus = s.bar[q] > 0 ? 0.6 : 1;
        sc -= pHit * opBarBonus * ((25 - n) + 8);
      }
    }
    if (best >= 3) sc += 2 * best * best;
    if (s.bar[p] > 0) {
      let blocked = 0;
      for (let n = 1; n <= 6; n++) { const idx = q === 0 ? n - 1 : 24 - n; if (s.pts[idx] * sgn(q) >= 2) blocked++; }
      sc -= s.bar[p] * (5 + 4 * blocked);
    }
    return sc;
  }
  function evaluate(s, p) {
    const w = winner(s);
    if (w >= 0) { const r = gameResult(s); return (w === p ? 1 : -1) * (1000 + r.mult * 50); }
    return side(s, p) - side(s, 1 - p);
  }
  function winProb(s, p) {
    const w = winner(s); if (w >= 0) return w === p ? 1 : 0;
    if (!hasContact(s)) {
      const mine = pips(s, p), theirs = pips(s, 1 - p), L = Math.min(mine, theirs);
      const z = (theirs - mine) / (1.3 * Math.sqrt(Math.max(L, 4)));
      return 1 / (1 + Math.exp(-1.7 * z));
    }
    return 1 / (1 + Math.exp(-evaluate(s, p) / 30));
  }
  // Cube AI. Doubler p about to roll; taker q.
  function aiShouldDouble(s, p, level) {
    if (level === 'easy') return false;
    const w = winProb(s, p);
    return w >= (level === 'hard' ? 0.7 : 0.75) && w <= 0.9;
  }
  function aiShouldTake(s, taker, level) {
    const w = winProb(s, taker);
    return w >= (level === 'easy' ? 0.15 : 0.25);
  }

  // ---------- AI ----------
  function randomPlay(plays, rng) { return plays[Math.floor((rng || defaultRng)() * plays.length)]; }
  const ROLLS = []; for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) ROLLS.push({ dice: [a, b], w: a === b ? 1 / 36 : 2 / 36 });

  function choosePlay(s, p, dice, level, rng) {
    const plays = genPlays(s, p, dice);
    if (!plays.length) return { moves: [], state: s };
    if (level === 'easy') return randomPlay(plays, rng);
    let best = null, bv = -Infinity;
    for (const pl of plays) { const v = evaluate(pl.state, p) + (rng || defaultRng)() * 0.01; if (v > bv) { bv = v; best = pl; } }
    return best;
  }
  // Time-sliced choice. cb(play) is always called asynchronously (setTimeout).
  function choosePlayAsync(s, p, dice, level, opts, cb) {
    opts = opts || {};
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const rng = opts.rng;
    const budget = opts.budgetMs == null ? 1200 : opts.budgetMs;
    const sliceMs = opts.sliceMs || 10;
    const t0 = now();
    setTimeout(function start() {
      const plays = genPlays(s, p, dice);
      if (!plays.length) return cb({ moves: [], state: s });
      if (level !== 'hard' || plays.length === 1) return cb(level === 'easy' ? randomPlay(plays, rng) : choosePlay(s, p, dice, level, rng));
      for (const pl of plays) pl.v1 = evaluate(pl.state, p);
      plays.sort((a, b) => b.v1 - a.v1);
      const K = Math.min(plays.length, dice[0] === dice[1] ? 7 : 10);
      const cands = plays.slice(0, K);
      let ci = 0, ri = 0, acc = 0;
      let bestPlay = cands[0], bestVal = -Infinity, done = 0;
      function finish() { cb(bestPlay); }
      (function slice() {
        const sliceEnd = now() + sliceMs;
        while (ci < cands.length) {
          if (now() - t0 > budget && done > 0) return finish();
          const c = cands[ci];
          if (winner(c.state) >= 0) { c.v2 = c.v1; }
          else {
            while (ri < ROLLS.length) {
              const R = ROLLS[ri], reply = genPlays(c.state, 1 - p, R.dice);
              let m = -Infinity;
              if (!reply.length) m = evaluate(c.state, p);
              else for (const rp of reply) { const v = -evaluate(rp.state, 1 - p); if (v < m || m === -Infinity) m = v; }
              acc += R.w * m; ri++;
              if (now() > sliceEnd) break;
            }
            if (ri < ROLLS.length) return setTimeout(slice, 0);
            c.v2 = acc;
          }
          const val = 0.25 * c.v1 + 0.75 * c.v2;
          done++;
          if (val > bestVal) { bestVal = val; bestPlay = c; }
          ci++; ri = 0; acc = 0;
          if (now() > sliceEnd && ci < cands.length) return setTimeout(slice, 0);
        }
        finish();
      })();
    }, 0);
  }

  const api = {
    BAR, OFF, newState, clone, key, pointNo, pips, allHome, checkerCount, singleMoves, applyMove, maxPlay, legalMoves, turnDice,
    remainingDice, genPlays, winner, gameResult, makeRng, rollDie, rollDice, openingRoll, evaluate, winProb, hasContact,
    aiShouldDouble, aiShouldTake, choosePlay, choosePlayAsync,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.BG = api;
})();
