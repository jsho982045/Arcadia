// Royal Chess engine — pure rules + AI, no DOM. Works in browsers (window.ChessEngine) and node (module.exports).
(function (global) {
  "use strict";
  const WHITE = 0, BLACK = 1, PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
  const F_EP = 1, F_CASTLE = 2, F_DOUBLE = 4;
  const FILES = "abcdefgh";
  const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const sqName = (s) => FILES[s & 7] + ((s >> 3) + 1);
  const parseSq = (n) => FILES.indexOf(n[0]) + 8 * (Number(n[1]) - 1);
  const mkMove = (from, to, promo, flags) => from | (to << 6) | ((promo || 0) << 12) | ((flags || 0) << 15);
  const mFrom = (m) => m & 63, mTo = (m) => (m >> 6) & 63, mPromo = (m) => (m >> 12) & 7, mFlags = (m) => m >> 15;

  // ---------- tables ----------
  const KN = [], KG = [], PAT = [[], []], RAYS = [[], [], [], [], [], [], [], []];
  const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]; // 0-3 rook, 4-7 bishop
  const KNM = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
  for (let sq = 0; sq < 64; sq++) {
    const f = sq & 7, r = sq >> 3;
    KN[sq] = []; KG[sq] = []; PAT[0][sq] = []; PAT[1][sq] = [];
    for (const [df, dr] of KNM) { const nf = f + df, nr = r + dr; if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) KN[sq].push(nr * 8 + nf); }
    for (const [df, dr] of DIRS) { const nf = f + df, nr = r + dr; if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) KG[sq].push(nr * 8 + nf); }
    for (const df of [-1, 1]) {
      if (f + df >= 0 && f + df < 8) {
        if (r + 1 < 8) PAT[0][sq].push((r + 1) * 8 + f + df);
        if (r - 1 >= 0) PAT[1][sq].push((r - 1) * 8 + f + df);
      }
    }
    for (let d = 0; d < 8; d++) {
      const ray = []; let nf = f + DIRS[d][0], nr = r + DIRS[d][1];
      while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) { ray.push(nr * 8 + nf); nf += DIRS[d][0]; nr += DIRS[d][1]; }
      RAYS[d][sq] = ray;
    }
  }
  const castleMask = new Int8Array(64).fill(15);
  castleMask[0] = 13; castleMask[7] = 14; castleMask[4] = 12; castleMask[56] = 7; castleMask[63] = 11; castleMask[60] = 3;

  // zobrist
  let seed = 0x9e3779b9;
  const rand32 = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return (t ^ (t >>> 14)) | 0; };
  const Z1 = new Int32Array(16 * 64), Z2 = new Int32Array(16 * 64), CA1 = new Int32Array(16), CA2 = new Int32Array(16), EP1 = new Int32Array(8), EP2 = new Int32Array(8);
  for (let i = 0; i < Z1.length; i++) { Z1[i] = rand32(); Z2[i] = rand32(); }
  for (let i = 0; i < 16; i++) { CA1[i] = rand32(); CA2[i] = rand32(); }
  for (let i = 0; i < 8; i++) { EP1[i] = rand32(); EP2[i] = rand32(); }
  const SIDE1 = rand32(), SIDE2 = rand32();

  // piece-square tables (rank 8 first, white's view)
  const T = {
    1: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    2: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    3: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    4: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    5: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    6: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
    7: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50],
  };
  const MAT_MG = [0, 100, 320, 330, 500, 900, 0], MAT_EG = [0, 115, 320, 335, 520, 940, 0];
  const VAL = [0, 100, 320, 330, 500, 900, 20000];
  const PHASE = [0, 0, 1, 1, 2, 4, 0];
  const PSTMG = new Int32Array(16 * 64), PSTEG = new Int32Array(16 * 64);
  for (let c = 0; c < 2; c++) for (let t = 1; t <= 6; t++) for (let sq = 0; sq < 64; sq++) {
    const f = sq & 7, r = sq >> 3, idx = c === 0 ? (7 - r) * 8 + f : r * 8 + f, p = c * 8 + t;
    const adv = c === 0 ? r : 7 - r;
    PSTMG[p * 64 + sq] = MAT_MG[t] + (t === 6 ? T[6][idx] : T[t][idx]);
    PSTEG[p * 64 + sq] = MAT_EG[t] + (t === 6 ? T[7][idx] : T[t][idx]) + (t === 1 ? adv * 6 : 0);
  }

  const HIST = 8192;
  class Position {
    constructor(fen) {
      this.board = new Int8Array(64); this.kingSq = [4, 60]; this.mg = [0, 0]; this.eg = [0, 0]; this.phase = 0; this.cnt = new Int8Array(16);
      this.h1 = 0; this.h2 = 0; this.turn = WHITE; this.castling = 0; this.ep = -1; this.half = 0; this.full = 1; this.ply = 0;
      this.uM = new Int32Array(HIST); this.uC = new Int8Array(HIST); this.uCa = new Int8Array(HIST); this.uEp = new Int8Array(HIST);
      this.uHf = new Int16Array(HIST); this.uH1 = new Int32Array(HIST); this.uH2 = new Int32Array(HIST);
      this.loadFEN(fen || START_FEN);
    }
    clone() {
      const p = new Position("8/8/8/8/8/8/8/K6k w - - 0 1");
      p.board.set(this.board); p.kingSq = this.kingSq.slice(); p.mg = this.mg.slice(); p.eg = this.eg.slice(); p.phase = this.phase; p.cnt.set(this.cnt);
      p.h1 = this.h1; p.h2 = this.h2; p.turn = this.turn; p.castling = this.castling; p.ep = this.ep; p.half = this.half; p.full = this.full; p.ply = this.ply;
      const n = this.ply;
      p.uM.set(this.uM.subarray(0, n)); p.uC.set(this.uC.subarray(0, n)); p.uCa.set(this.uCa.subarray(0, n)); p.uEp.set(this.uEp.subarray(0, n));
      p.uHf.set(this.uHf.subarray(0, n)); p.uH1.set(this.uH1.subarray(0, n)); p.uH2.set(this.uH2.subarray(0, n));
      return p;
    }
    put(sq, p) {
      this.board[sq] = p; const c = p >> 3, k = p * 64 + sq;
      this.h1 ^= Z1[k]; this.h2 ^= Z2[k]; this.mg[c] += PSTMG[k]; this.eg[c] += PSTEG[k]; this.phase += PHASE[p & 7]; this.cnt[p]++;
      if ((p & 7) === KING) this.kingSq[c] = sq;
    }
    del(sq) {
      const p = this.board[sq]; this.board[sq] = 0; const c = p >> 3, k = p * 64 + sq;
      this.h1 ^= Z1[k]; this.h2 ^= Z2[k]; this.mg[c] -= PSTMG[k]; this.eg[c] -= PSTEG[k]; this.phase -= PHASE[p & 7]; this.cnt[p]--;
    }
    epHashFile() {
      if (this.ep < 0) return -1;
      const t = this.turn, psq = t === WHITE ? this.ep - 8 : this.ep + 8, f = psq & 7, mine = t * 8 + PAWN;
      return ((f > 0 && this.board[psq - 1] === mine) || (f < 7 && this.board[psq + 1] === mine)) ? this.ep & 7 : -1;
    }
    loadFEN(fen) {
      const parts = fen.trim().split(/\s+/);
      this.board.fill(0); this.mg = [0, 0]; this.eg = [0, 0]; this.phase = 0; this.cnt.fill(0); this.h1 = 0; this.h2 = 0; this.ply = 0;
      const map = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 };
      const rows = parts[0].split("/");
      for (let i = 0; i < 8; i++) {
        let f = 0; const r = 7 - i;
        for (const ch of rows[i]) {
          if (ch >= "1" && ch <= "8") f += Number(ch);
          else { const lower = ch.toLowerCase(); this.put(r * 8 + f, (ch === lower ? 8 : 0) + map[lower]); f++; }
        }
      }
      this.turn = parts[1] === "b" ? BLACK : WHITE;
      this.castling = 0;
      const cs = parts[2] || "-";
      if (cs.includes("K")) this.castling |= 1; if (cs.includes("Q")) this.castling |= 2; if (cs.includes("k")) this.castling |= 4; if (cs.includes("q")) this.castling |= 8;
      this.ep = parts[3] && parts[3] !== "-" ? parseSq(parts[3]) : -1;
      this.half = Number(parts[4] || 0); this.full = Number(parts[5] || 1);
      this.h1 ^= CA1[this.castling]; this.h2 ^= CA2[this.castling];
      if (this.turn === BLACK) { this.h1 ^= SIDE1; this.h2 ^= SIDE2; }
      const ef = this.epHashFile(); if (ef >= 0) { this.h1 ^= EP1[ef]; this.h2 ^= EP2[ef]; }
    }
    toFEN() {
      let s = "";
      for (let r = 7; r >= 0; r--) {
        let e = 0;
        for (let f = 0; f < 8; f++) {
          const p = this.board[r * 8 + f];
          if (!p) e++; else { if (e) { s += e; e = 0; } const ch = " pnbrqk"[p & 7]; s += p >> 3 ? ch : ch.toUpperCase(); }
        }
        if (e) s += e; if (r) s += "/";
      }
      const c = (this.castling & 1 ? "K" : "") + (this.castling & 2 ? "Q" : "") + (this.castling & 4 ? "k" : "") + (this.castling & 8 ? "q" : "");
      return `${s} ${this.turn ? "b" : "w"} ${c || "-"} ${this.ep >= 0 ? sqName(this.ep) : "-"} ${this.half} ${this.full}`;
    }
    attacked(sq, by) {
      const b = this.board;
      for (const s of PAT[by ^ 1][sq]) if (b[s] === by * 8 + PAWN) return true;
      for (const s of KN[sq]) if (b[s] === by * 8 + KNIGHT) return true;
      for (const s of KG[sq]) if (b[s] === by * 8 + KING) return true;
      const rk = by * 8 + ROOK, bs = by * 8 + BISHOP, qn = by * 8 + QUEEN;
      for (let d = 0; d < 4; d++) { for (const s of RAYS[d][sq]) { const p = b[s]; if (p) { if (p === rk || p === qn) return true; break; } } }
      for (let d = 4; d < 8; d++) { for (const s of RAYS[d][sq]) { const p = b[s]; if (p) { if (p === bs || p === qn) return true; break; } } }
      return false;
    }
    inCheck() { return this.attacked(this.kingSq[this.turn], this.turn ^ 1); }
    // pseudo-legal moves. caps=true: captures + promotions only (for quiescence)
    gen(caps) {
      const out = [], b = this.board, us = this.turn, them = us ^ 1;
      for (let sq = 0; sq < 64; sq++) {
        const p = b[sq];
        if (!p || (p >> 3) !== us) continue;
        const t = p & 7;
        if (t === PAWN) {
          const dir = us ? -8 : 8, start = us ? 6 : 1, last = us ? 0 : 7, r = sq >> 3, to = sq + dir;
          if (!b[to]) {
            if ((to >> 3) === last) { out.push(mkMove(sq, to, QUEEN)); if (!caps) out.push(mkMove(sq, to, ROOK), mkMove(sq, to, BISHOP), mkMove(sq, to, KNIGHT)); }
            else if (!caps) {
              out.push(mkMove(sq, to));
              if (r === start && !b[to + dir]) out.push(mkMove(sq, to + dir, 0, F_DOUBLE));
            }
          }
          for (const t2 of PAT[us][sq]) {
            const q = b[t2];
            if (q && (q >> 3) === them) {
              if ((t2 >> 3) === last) { out.push(mkMove(sq, t2, QUEEN)); out.push(mkMove(sq, t2, ROOK), mkMove(sq, t2, BISHOP), mkMove(sq, t2, KNIGHT)); }
              else out.push(mkMove(sq, t2));
            } else if (t2 === this.ep) out.push(mkMove(sq, t2, 0, F_EP));
          }
        } else if (t === KNIGHT || t === KING) {
          for (const t2 of t === KNIGHT ? KN[sq] : KG[sq]) {
            const q = b[t2];
            if (q ? (q >> 3) === them : !caps) out.push(mkMove(sq, t2));
          }
          if (t === KING && !caps) {
            const home = us ? 60 : 4;
            if (sq === home) {
              const ks = us ? 4 : 1, qs = us ? 8 : 2;
              if ((this.castling & ks) && !b[home + 1] && !b[home + 2] && b[home + 3] === us * 8 + ROOK &&
                !this.attacked(home, them) && !this.attacked(home + 1, them) && !this.attacked(home + 2, them)) out.push(mkMove(home, home + 2, 0, F_CASTLE));
              if ((this.castling & qs) && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === us * 8 + ROOK &&
                !this.attacked(home, them) && !this.attacked(home - 1, them) && !this.attacked(home - 2, them)) out.push(mkMove(home, home - 2, 0, F_CASTLE));
            }
          }
        } else {
          const d0 = t === BISHOP ? 4 : 0, d1 = t === ROOK ? 4 : 8;
          for (let d = d0; d < d1; d++) {
            for (const t2 of RAYS[d][sq]) {
              const q = b[t2];
              if (!q) { if (!caps) out.push(mkMove(sq, t2)); }
              else { if ((q >> 3) === them) out.push(mkMove(sq, t2)); break; }
            }
          }
        }
      }
      return out;
    }
    legalMoves() {
      const moves = this.gen(false), out = [], us = this.turn;
      for (const m of moves) {
        this.make(m);
        if (!this.attacked(this.kingSq[us], us ^ 1)) out.push(m);
        this.unmake();
      }
      return out;
    }
    make(m) {
      const b = this.board, from = m & 63, to = (m >> 6) & 63, promo = (m >> 12) & 7, fl = m >> 15, us = this.turn, p = b[from];
      let cap = b[to], capSq = to;
      if (fl & F_EP) { capSq = us ? to + 8 : to - 8; cap = b[capSq]; }
      const i = this.ply++;
      this.uM[i] = m; this.uC[i] = cap; this.uCa[i] = this.castling; this.uEp[i] = this.ep; this.uHf[i] = this.half; this.uH1[i] = this.h1; this.uH2[i] = this.h2;
      const oe = this.epHashFile();
      if (oe >= 0) { this.h1 ^= EP1[oe]; this.h2 ^= EP2[oe]; }
      this.h1 ^= CA1[this.castling]; this.h2 ^= CA2[this.castling];
      if (cap) this.del(capSq);
      this.del(from);
      this.put(to, promo ? us * 8 + promo : p);
      if (fl & F_CASTLE) {
        const rf = to > from ? to + 1 : to - 2, rt = to > from ? to - 1 : to + 1, rook = b[rf];
        this.del(rf); this.put(rt, rook);
      }
      this.castling &= castleMask[from] & castleMask[to];
      const isPawn = (p & 7) === PAWN;
      this.ep = isPawn && (to - from === 16 || from - to === 16) ? (from + to) >> 1 : -1;
      this.half = isPawn || cap ? 0 : this.half + 1;
      if (us) this.full++;
      this.turn = us ^ 1;
      this.h1 ^= SIDE1 ^ CA1[this.castling]; this.h2 ^= SIDE2 ^ CA2[this.castling];
      const ne = this.epHashFile();
      if (ne >= 0) { this.h1 ^= EP1[ne]; this.h2 ^= EP2[ne]; }
    }
    unmake() {
      const i = --this.ply, m = this.uM[i], b = this.board, from = m & 63, to = (m >> 6) & 63, promo = (m >> 12) & 7, fl = m >> 15, us = this.turn ^ 1;
      this.turn = us;
      let p = b[to]; if (promo) p = us * 8 + PAWN;
      this.del(to); this.put(from, p);
      const cap = this.uC[i];
      if (cap) this.put(fl & F_EP ? (us ? to + 8 : to - 8) : to, cap);
      if (fl & F_CASTLE) {
        const rf = to > from ? to + 1 : to - 2, rt = to > from ? to - 1 : to + 1, rook = b[rt];
        this.del(rt); this.put(rf, rook);
      }
      this.castling = this.uCa[i]; this.ep = this.uEp[i]; this.half = this.uHf[i]; this.h1 = this.uH1[i]; this.h2 = this.uH2[i];
      if (us) this.full--;
    }
    makeNull() {
      const i = this.ply++;
      this.uM[i] = 0; this.uC[i] = 0; this.uCa[i] = this.castling; this.uEp[i] = this.ep; this.uHf[i] = this.half; this.uH1[i] = this.h1; this.uH2[i] = this.h2;
      this.ep = -1; this.turn ^= 1; this.h1 = this.uH1[i] ^ SIDE1; this.h2 = this.uH2[i] ^ SIDE2; this.half++;
    }
    unmakeNull() {
      const i = --this.ply;
      this.turn ^= 1; this.ep = this.uEp[i]; this.half = this.uHf[i]; this.h1 = this.uH1[i]; this.h2 = this.uH2[i];
    }
    // how many times the current position has occurred (including now)
    repetitionCount() {
      let n = 1;
      for (let k = 2; k <= this.half; k += 2) {
        const idx = this.ply - k;
        if (idx < 0) break;
        if (this.uH1[idx] === this.h1 && this.uH2[idx] === this.h2) n++;
      }
      return n;
    }
    isRepetition() {
      for (let k = 2; k <= this.half; k += 2) {
        const idx = this.ply - k;
        if (idx < 0) break;
        if (this.uH1[idx] === this.h1 && this.uH2[idx] === this.h2) return true;
      }
      return false;
    }
    insufficientMaterial() {
      const c = this.cnt;
      if (c[1] || c[9] || c[4] || c[12] || c[5] || c[13]) return false;
      const minors = c[2] + c[10] + c[3] + c[11];
      if (minors <= 1) return true;
      if (c[2] || c[10]) return false; // knights plus something else: mate is possible in theory
      // only bishops: draw if all on same square colour
      let col = -1;
      for (let sq = 0; sq < 64; sq++) {
        const p = this.board[sq];
        if ((p & 7) === BISHOP) { const sc = ((sq >> 3) + (sq & 7)) & 1; if (col < 0) col = sc; else if (col !== sc) return false; }
      }
      return true;
    }
    hasPieces(c) { const k = this.cnt; const o = c * 8; return k[o + 2] + k[o + 3] + k[o + 4] + k[o + 5] > 0; }
    status(legal) {
      legal = legal || this.legalMoves();
      if (!legal.length) return this.inCheck() ? { over: true, result: "checkmate", winner: this.turn ^ 1 } : { over: true, result: "stalemate", winner: -1 };
      if (this.insufficientMaterial()) return { over: true, result: "insufficient", winner: -1 };
      if (this.repetitionCount() >= 3) return { over: true, result: "threefold", winner: -1 };
      if (this.half >= 100) return { over: true, result: "fifty", winner: -1 };
      return { over: false, result: null, winner: -1 };
    }
    evaluate() {
      const ph = this.phase > 24 ? 24 : this.phase, k = this.cnt;
      let mg = this.mg[0] - this.mg[1], eg = this.eg[0] - this.eg[1];
      if (k[3] >= 2) { mg += 30; eg += 45; }
      if (k[11] >= 2) { mg -= 30; eg -= 45; }
      const s = ((mg * ph + eg * (24 - ph)) / 24) | 0;
      return (this.turn ? -s : s) + 8;
    }
    findMove(from, to, promo) {
      for (const m of this.legalMoves()) if (mFrom(m) === from && mTo(m) === to && (mPromo(m) || 0) === (promo || 0)) return m;
      return 0;
    }
  }

  function moveToUCI(m) { return sqName(mFrom(m)) + sqName(mTo(m)) + (mPromo(m) ? ["", "", "n", "b", "r", "q"][mPromo(m)] : ""); }
  function moveFromUCI(pos, s) {
    const from = parseSq(s.slice(0, 2)), to = parseSq(s.slice(2, 4)), pc = s[4] ? { n: 2, b: 3, r: 4, q: 5 }[s[4]] : 0;
    return pos.findMove(from, to, pc);
  }
  function moveToSAN(pos, m) {
    const from = mFrom(m), to = mTo(m), promo = mPromo(m), fl = mFlags(m), p = pos.board[from], t = p & 7;
    let s;
    if (fl & F_CASTLE) s = to > from ? "O-O" : "O-O-O";
    else {
      const isCap = pos.board[to] !== 0 || (fl & F_EP) !== 0;
      if (t === PAWN) s = (isCap ? FILES[from & 7] + "x" : "") + sqName(to) + (promo ? "=" + "??NBRQ"[promo] : "");
      else {
        s = "?PNBRQK"[t];
        const others = pos.legalMoves().filter((o) => o !== m && mTo(o) === to && pos.board[mFrom(o)] === p);
        if (others.length) {
          const sameFile = others.some((o) => (mFrom(o) & 7) === (from & 7)), sameRank = others.some((o) => (mFrom(o) >> 3) === (from >> 3));
          if (!sameFile) s += FILES[from & 7]; else if (!sameRank) s += (from >> 3) + 1; else s += sqName(from);
        }
        if (isCap) s += "x";
        s += sqName(to);
      }
    }
    pos.make(m);
    if (pos.inCheck()) s += pos.legalMoves().length ? "+" : "#";
    pos.unmake();
    return s;
  }

  function perft(pos, depth) {
    const moves = pos.legalMoves();
    if (depth <= 1) return moves.length;
    let n = 0;
    for (const m of moves) { pos.make(m); n += perft(pos, depth - 1); pos.unmake(); }
    return n;
  }

  // ---------- search ----------
  const INF = 30000, MATE = 29000, MAXPLY = 128;
  const ABORT = { abort: true };
  const now = typeof performance !== "undefined" && performance.now ? () => performance.now() : () => Date.now();
  const TT_BITS = 18, TT_MASK = (1 << TT_BITS) - 1;
  let ttKey, ttMv, ttScore, ttDepth, ttFlag;
  function clearTT() {
    if (!ttKey) { ttKey = new Int32Array(1 << TT_BITS); ttMv = new Int32Array(1 << TT_BITS); ttScore = new Int16Array(1 << TT_BITS); ttDepth = new Int8Array(1 << TT_BITS); ttFlag = new Int8Array(1 << TT_BITS); }
    else ttFlag.fill(0);
  }
  const LEVELS = {
    1: { name: "Easy", maxDepth: 1, timeMs: 250, noise: 230 },
    2: { name: "Medium", maxDepth: 3, timeMs: 600, noise: 45 },
    3: { name: "Hard", maxDepth: 8, timeMs: 1200, noise: 0 },
    4: { name: "Master", maxDepth: 24, timeMs: 2600, noise: 0 },
  };

  function scoreMoves(pos, moves, ttMove, ply, ctx) {
    const b = pos.board, sc = new Array(moves.length), k = ctx.killers[ply], us = pos.turn;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i], from = m & 63, to = (m >> 6) & 63, promo = (m >> 12) & 7;
      if (m === ttMove) { sc[i] = 1e7; continue; }
      const victim = b[to] ? b[to] & 7 : (m >> 15) & F_EP ? PAWN : 0;
      if (victim) sc[i] = 1e6 + VAL[victim] * 10 - (b[from] & 7);
      else if (promo) sc[i] = 9.5e5 + promo;
      else if (k && k[0] === m) sc[i] = 9e5;
      else if (k && k[1] === m) sc[i] = 8e5;
      else sc[i] = ctx.history[us * 4096 + from * 64 + to];
    }
    return sc;
  }
  function pick(moves, sc, i) {
    let bi = i;
    for (let j = i + 1; j < moves.length; j++) if (sc[j] > sc[bi]) bi = j;
    if (bi !== i) { const tm = moves[i]; moves[i] = moves[bi]; moves[bi] = tm; const ts = sc[i]; sc[i] = sc[bi]; sc[bi] = ts; }
  }
  function qsearch(pos, alpha, beta, ctx, ply) {
    if ((++ctx.nodes & 1023) === 0 && now() > ctx.hard) throw ABORT;
    const stand = pos.evaluate();
    if (ply >= MAXPLY - 1) return stand;
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const moves = pos.gen(true), sc = new Array(moves.length), b = pos.board, us = pos.turn;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i], v = b[(m >> 6) & 63] ? b[(m >> 6) & 63] & 7 : (m >> 15) & F_EP ? PAWN : 0;
      sc[i] = VAL[v] * 10 - (b[m & 63] & 7) + ((m >> 12) & 7 ? 5000 : 0);
    }
    for (let i = 0; i < moves.length; i++) {
      pick(moves, sc, i);
      const m = moves[i], to = (m >> 6) & 63, promo = (m >> 12) & 7;
      const victim = b[to] ? b[to] & 7 : promo ? 0 : PAWN;
      if (!promo && stand + VAL[victim] + 200 < alpha) continue;
      pos.make(m);
      if (pos.attacked(pos.kingSq[us], us ^ 1)) { pos.unmake(); continue; }
      const s = -qsearch(pos, -beta, -alpha, ctx, ply + 1);
      pos.unmake();
      if (s >= beta) return s;
      if (s > alpha) alpha = s;
    }
    return alpha;
  }
  function storeKiller(ctx, ply, m, us, from, to, depth) {
    const k = ctx.killers[ply];
    if (k[0] !== m) { k[1] = k[0]; k[0] = m; }
    const h = ctx.history, idx = us * 4096 + from * 64 + to;
    h[idx] += depth * depth; if (h[idx] > 4e5) for (let i = 0; i < h.length; i++) h[i] >>= 1;
  }
  function ab(pos, depth, alpha, beta, ply, ctx, allowNull) {
    if ((++ctx.nodes & 1023) === 0 && now() > ctx.hard) throw ABORT;
    if (pos.half >= 100 || pos.isRepetition()) return 0;
    const us = pos.turn, inCheck = pos.inCheck();
    if (inCheck) depth++;
    if (depth <= 0 || ply >= MAXPLY - 2) return qsearch(pos, alpha, beta, ctx, ply);
    const alphaOrig = alpha; let ttMove = 0;
    const idx = pos.h1 & TT_MASK;
    if (ttFlag[idx] && ttKey[idx] === pos.h2) {
      ttMove = ttMv[idx];
      if (ttDepth[idx] >= depth) {
        let s = ttScore[idx]; if (s > MATE - MAXPLY) s -= ply; else if (s < -MATE + MAXPLY) s += ply;
        const f = ttFlag[idx];
        if (f === 1) return s;
        if (f === 2 && s > alpha) alpha = s; else if (f === 3 && s < beta) beta = s;
        if (alpha >= beta) return s;
      }
    }
    if (allowNull && !inCheck && depth >= 3 && beta < MATE - MAXPLY && pos.hasPieces(us) && pos.evaluate() >= beta) {
      pos.makeNull();
      const s = -ab(pos, depth - 3, -beta, -beta + 1, ply + 1, ctx, false);
      pos.unmakeNull();
      if (s >= beta) return beta;
    }
    const moves = pos.gen(false), sc = scoreMoves(pos, moves, ttMove, ply, ctx), b = pos.board;
    let best = -INF, bestMove = 0, legal = 0;
    for (let i = 0; i < moves.length; i++) {
      pick(moves, sc, i);
      const m = moves[i], from = m & 63, to = (m >> 6) & 63, promo = (m >> 12) & 7;
      const quiet = !b[to] && !promo && !((m >> 15) & F_EP);
      pos.make(m);
      if (pos.attacked(pos.kingSq[us], us ^ 1)) { pos.unmake(); continue; }
      legal++;
      let s;
      if (legal === 1) s = -ab(pos, depth - 1, -beta, -alpha, ply + 1, ctx, true);
      else {
        let red = 0;
        if (depth >= 3 && legal > 4 && quiet && !inCheck) red = legal > 10 && depth > 5 ? 2 : 1;
        s = -ab(pos, depth - 1 - red, -alpha - 1, -alpha, ply + 1, ctx, true);
        if (s > alpha && (red || s < beta)) s = -ab(pos, depth - 1, -beta, -alpha, ply + 1, ctx, true);
      }
      pos.unmake();
      if (s > best) {
        best = s; bestMove = m;
        if (s > alpha) { alpha = s; if (alpha >= beta) { if (quiet) storeKiller(ctx, ply, m, us, from, to, depth); break; } }
      }
    }
    if (!legal) return inCheck ? -MATE + ply : 0;
    ttKey[idx] = pos.h2; ttMv[idx] = bestMove; ttDepth[idx] = depth > 100 ? 100 : depth;
    ttFlag[idx] = best <= alphaOrig ? 3 : best >= beta ? 2 : 1;
    let st = best; if (st > MATE - MAXPLY) st += ply; else if (st < -MATE + MAXPLY) st -= ply;
    ttScore[idx] = st;
    return best;
  }
  // ply-1 node written as a generator so the driver can yield between slices
  function* ab1(pos, depth, alpha, beta, ctx) {
    ctx.nodes++;
    if (pos.half >= 100 || pos.isRepetition()) return 0;
    const us = pos.turn, inCheck = pos.inCheck();
    if (inCheck) depth++;
    if (depth <= 0) return qsearch(pos, alpha, beta, ctx, 1);
    const moves = pos.gen(false), sc = scoreMoves(pos, moves, 0, 1, ctx), b = pos.board;
    let best = -INF, legal = 0;
    for (let i = 0; i < moves.length; i++) {
      pick(moves, sc, i);
      const m = moves[i], from = m & 63, to = (m >> 6) & 63, promo = (m >> 12) & 7;
      const quiet = !b[to] && !promo && !((m >> 15) & F_EP);
      pos.make(m);
      if (pos.attacked(pos.kingSq[us], us ^ 1)) { pos.unmake(); continue; }
      legal++;
      let s;
      if (legal === 1) s = -ab(pos, depth - 1, -beta, -alpha, 2, ctx, true);
      else {
        s = -ab(pos, depth - 1, -alpha - 1, -alpha, 2, ctx, true);
        if (s > alpha && s < beta) s = -ab(pos, depth - 1, -beta, -alpha, 2, ctx, true);
      }
      pos.unmake();
      if (s > best) { best = s; if (s > alpha) { alpha = s; if (alpha >= beta) { if (quiet) storeKiller(ctx, 1, m, us, from, to, depth); break; } } }
      if (now() > ctx.sliceEnd) yield;
    }
    if (!legal) return inCheck ? -MATE + 1 : 0;
    return best;
  }

  // Resumable search. Call .step(ms) repeatedly until it returns true, then read .result = {move, score, depth, nodes}
  function createSearch(pos0, opts) {
    opts = opts || {};
    const cfg = Object.assign({}, LEVELS[opts.level || 3], opts);
    const pos = opts.inPlace ? pos0 : pos0.clone();
    const rng = opts.rng || Math.random;
    clearTT();
    const start = now();
    const ctx = { nodes: 0, hard: start + cfg.timeMs, sliceEnd: Infinity, killers: [], history: new Int32Array(2 * 4096) };
    for (let i = 0; i < MAXPLY + 2; i++) ctx.killers.push([0, 0]);
    const basePly = pos.ply;
    function unwind() { while (pos.ply > basePly) { if (pos.uM[pos.ply - 1] === 0) pos.unmakeNull(); else pos.unmake(); } }
    function* run() {
      let moves = pos.legalMoves();
      if (!moves.length) return { move: 0, score: 0, depth: 0, nodes: 0 };
      if (moves.length === 1) return { move: moves[0], score: 0, depth: 0, nodes: 0 };
      const sc0 = scoreMoves(pos, moves, 0, 0, ctx);
      for (let i = 0; i < moves.length; i++) pick(moves, sc0, i);
      let result = { move: moves[0], score: 0, depth: 0, nodes: 0 };
      let scores = moves.map(() => 0);
      for (let depth = 1; depth <= cfg.maxDepth; depth++) {
        const iter = [];
        let alpha = -INF, bestS = -INF;
        try {
          for (let i = 0; i < moves.length; i++) {
            pos.make(moves[i]);
            let s;
            if (cfg.noise > 0) s = -(yield* ab1(pos, depth - 1, -INF, INF, ctx));
            else if (i === 0) s = -(yield* ab1(pos, depth - 1, -INF, -alpha, ctx));
            else {
              s = -(yield* ab1(pos, depth - 1, -alpha - 1, -alpha, ctx));
              if (s > alpha) s = -(yield* ab1(pos, depth - 1, -INF, -alpha, ctx));
            }
            pos.unmake();
            iter.push(s);
            if (s > bestS) bestS = s;
            if (s > alpha) alpha = s;
            if (now() > ctx.sliceEnd) yield;
          }
        } catch (e) { if (e !== ABORT) throw e; unwind(); break; }
        // iteration complete: sort by score (stable, best first)
        const order = moves.map((m, i) => i).sort((a, b2) => iter[b2] - iter[a] || a - b2);
        moves = order.map((i) => moves[i]); scores = order.map((i) => iter[i]);
        result = { move: moves[0], score: scores[0], depth, nodes: ctx.nodes };
        if (Math.abs(scores[0]) > MATE - 100) break;
        if (now() - start > cfg.timeMs * 0.45) break;
      }
      if (cfg.noise > 0) {
        let bestV = -Infinity, bm = moves[0];
        for (let i = 0; i < moves.length; i++) {
          const n = Math.abs(scores[i]) > MATE - 200 ? 0 : (rng() * 2 - 1) * cfg.noise;
          const v = scores[i] + n;
          if (v > bestV) { bestV = v; bm = moves[i]; }
        }
        result.move = bm;
      }
      result.nodes = ctx.nodes;
      return result;
    }
    const gen = run();
    const handle = {
      done: false, result: null, ctx,
      step(ms) {
        if (handle.done) return true;
        ctx.sliceEnd = now() + (ms === undefined ? 10 : ms);
        const r = gen.next();
        if (r.done) { handle.done = true; handle.result = r.value; unwind(); }
        return handle.done;
      },
      cancel() { handle.done = true; },
    };
    return handle;
  }
  function searchSync(pos, opts) {
    const h = createSearch(pos, opts);
    while (!h.step(1e9)) { /* run to completion */ }
    return h.result;
  }

  const api = {
    Position, createSearch, searchSync, perft, LEVELS, START_FEN, sqName, parseSq, moveToSAN, moveToUCI, moveFromUCI, mkMove, mFrom, mTo, mPromo, mFlags,
    WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, F_EP, F_CASTLE, F_DOUBLE, VAL, clearTT,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.ChessEngine = api;
  else if (global) global.ChessEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
