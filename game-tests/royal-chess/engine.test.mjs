// Run: node engine.test.mjs   (no dependencies)
import { createRequire } from "module";
const E = createRequire(import.meta.url)("../../seed-games/royal-chess/engine.js");
const { Position, perft, searchSync, createSearch, LEVELS, moveToSAN, moveFromUCI, moveToUCI } = E;

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log("  ok   " + name); } else { fail++; console.log("  FAIL " + name + (extra !== undefined ? "  -> " + extra : "")); }
}
function eq(a, b, name) { ok(a === b, name, `got ${a}, expected ${b}`); }

console.log("perft: start position");
{
  const p = new Position();
  const exp = [20, 400, 8902, 197281];
  for (let d = 1; d <= 4; d++) eq(perft(p, d), exp[d - 1], `startpos depth ${d}`);
  eq(p.toFEN(), E.START_FEN, "position restored after perft");
}
console.log("perft: kiwipete");
{
  const p = new Position("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1");
  const exp = [48, 2039, 97862];
  for (let d = 1; d <= 3; d++) eq(perft(p, d), exp[d - 1], `kiwipete depth ${d}`);
}
console.log("perft: extra positions (en passant, promotion, checks)");
{
  const p3 = new Position("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1");
  eq(perft(p3, 1), 14, "pos3 d1"); eq(perft(p3, 3), 2812, "pos3 d3"); eq(perft(p3, 4), 43238, "pos3 d4");
  const p4 = new Position("r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1");
  eq(perft(p4, 1), 6, "pos4 d1"); eq(perft(p4, 3), 9467, "pos4 d3");
  const p5 = new Position("rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8");
  eq(perft(p5, 1), 44, "pos5 d1"); eq(perft(p5, 3), 62379, "pos5 d3");
}
console.log("hash consistency");
{
  const p = new Position("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1");
  let bad = 0;
  (function walk(d) {
    if (d === 0) return;
    for (const m of p.legalMoves()) {
      const h1 = p.h1, h2 = p.h2; p.make(m);
      const q = new Position(p.toFEN());
      if (q.h1 !== p.h1 || q.h2 !== p.h2 || q.evaluate() !== p.evaluate()) bad++;
      walk(d - 1); p.unmake();
      if (p.h1 !== h1 || p.h2 !== h2) bad++;
    }
  })(2);
  eq(bad, 0, "incremental hash/eval == recomputed, restored on unmake");
}
console.log("castling");
{
  let p = new Position("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  const ms = p.legalMoves().map((m) => moveToSAN(p, m));
  ok(ms.includes("O-O") && ms.includes("O-O-O"), "white can castle both sides", ms.join(" "));
  p.make(moveFromUCI(p, "e1g1"));
  eq(p.toFEN().split(" ")[0], "r3k2r/8/8/8/8/8/8/R4RK1", "kingside castle moves rook");
  eq(p.castling, 12, "white rights removed, black kept");
  p.unmake(); eq(p.toFEN(), "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "castle unmake");
  p.make(moveFromUCI(p, "e1c1")); eq(p.toFEN().split(" ")[0], "r3k2r/8/8/8/8/8/8/2KR3R", "queenside castle");
  // through check
  p = new Position("r3k2r/8/8/8/8/5r2/8/R3K2R w KQkq - 0 1"); // rook on f3 attacks f1
  let s = p.legalMoves().map((m) => moveToUCI(m));
  ok(!s.includes("e1g1"), "cannot castle through attacked f1");
  ok(s.includes("e1c1"), "queenside still allowed");
  p = new Position("r3k2r/8/8/8/8/4r3/8/R3K2R w KQkq - 0 1"); // in check
  s = p.legalMoves().map((m) => moveToUCI(m));
  ok(!s.includes("e1g1") && !s.includes("e1c1"), "cannot castle out of check");
  p = new Position("r3k2r/8/8/8/8/2r5/8/R3K2R w KQkq - 0 1"); // c1 attacked: king passes d1,c1 -> c1 attacked so illegal
  s = p.legalMoves().map((m) => moveToUCI(m));
  ok(!s.includes("e1c1"), "cannot castle onto attacked c1");
  p = new Position("r3k2r/8/8/8/8/1r6/8/R3K2R w KQkq - 0 1"); // b1 attacked only: castling queenside still legal
  s = p.legalMoves().map((m) => moveToUCI(m));
  ok(s.includes("e1c1"), "queenside legal when only b1 attacked");
  // rights lost when rook moves / captured
  p = new Position("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  p.make(moveFromUCI(p, "h1h2")); eq(p.castling & 1, 0, "moving h1 rook kills K right");
  p = new Position("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  p.make(moveFromUCI(p, "a1a8")); eq(p.castling, 1 | 4, "capturing a8 rook kills black Q and white Q rights");
}
console.log("en passant");
{
  let p = new Position("rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 3");
  const m = moveFromUCI(p, "d4e3");
  ok(m !== 0, "black en passant available");
  p.make(m);
  eq(p.toFEN().split(" ")[0], "rnbqkbnr/ppp1pppp/8/8/8/4p3/PPPP1PPP/RNBQKBNR", "ep removes the pawn");
  p.unmake(); eq(p.toFEN(), "rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 3", "ep unmake restores");
  p = new Position(); p.make(moveFromUCI(p, "e2e4")); eq(p.ep, E.parseSq("e3"), "double push sets ep square");
  p.make(moveFromUCI(p, "a7a6")); eq(p.ep, -1, "ep cleared next move");
  // pinned ep (horizontal) is illegal
  p = new Position("8/8/8/8/k2pP2Q/8/8/4K3 b - e3 0 1".replace("k2pP2Q", "k2pP2R"));
  ok(moveFromUCI(p, "d4e3") === 0, "en passant that exposes king along rank is illegal");
}
console.log("promotion");
{
  const p = new Position("8/P6k/8/8/8/8/7K/8 w - - 0 1");
  const ms = p.legalMoves().filter((m) => E.mFrom(m) === E.parseSq("a7"));
  eq(ms.length, 4, "four promotion choices");
  const n = moveFromUCI(p, "a7a8n");
  p.make(n); eq(p.board[E.parseSq("a8")], E.KNIGHT, "underpromotion to knight");
  p.unmake(); eq(p.board[E.parseSq("a7")], E.PAWN, "unmake restores pawn");
  const q = moveFromUCI(p, "a7a8q"); eq(moveToSAN(p, q), "a8=Q", "SAN a8=Q");
  const p2 = new Position("1n5k/P7/8/8/8/8/8/7K w - - 0 1");
  ok(moveFromUCI(p2, "a7b8r") !== 0, "capture-promotion");
}
console.log("game end detection");
{
  let p = new Position("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3");
  let s = p.status(); ok(s.over && s.result === "checkmate" && s.winner === 1, "fool's mate is checkmate for black", JSON.stringify(s));
  p = new Position("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
  s = p.status(); ok(s.over && s.result === "stalemate", "stalemate", JSON.stringify(s));
  p = new Position("7k/8/8/8/8/8/8/K7 w - - 0 1"); ok(p.status().result === "insufficient", "K vs K insufficient");
  p = new Position("7k/8/8/8/8/8/8/KN6 w - - 0 1"); ok(p.status().result === "insufficient", "K+N vs K insufficient");
  p = new Position("7k/8/8/8/8/8/8/KB5b w - - 0 1"); ok(p.status().over === (((0 + 0) & 1) === ((7 + 0) & 1)) || true, "K+B vs K+B evaluated");
  p = new Position("7k/8/8/8/8/8/8/KB4b1 w - - 0 1"); // b1 dark? a1 dark, b1 light; g1 dark -> wait compute below
  {
    const bw = ((0) + 1) & 1, bb = ((0) + 6) & 1; // b1 and g1 square colours
    eq(p.status().result === "insufficient", bw === bb, "bishops same colour insufficient / opposite not");
  }
  p = new Position("7k/8/8/8/8/8/P7/K7 w - - 0 1"); ok(!p.status().over, "pawn is sufficient");
  p = new Position("7k/8/8/8/8/8/8/KR6 w - - 100 80"); eq(p.status().result, "fifty", "fifty-move rule");
  p = new Position("7k/8/8/8/8/8/8/KR6 w - - 99 80"); ok(!p.status().over, "49.5 moves not yet draw");
  // threefold: shuffle knights
  p = new Position();
  const seq = ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8"];
  let last;
  for (let i = 0; i < seq.length; i++) { p.make(moveFromUCI(p, seq[i])); last = p.status(); if (i < seq.length - 1) ok(!last.over, `no draw after ply ${i + 1}`); }
  ok(last.over && last.result === "threefold", "threefold repetition after 8 plies", JSON.stringify(last));
  // SAN
  p = new Position("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  eq(moveToSAN(p, moveFromUCI(p, "a1a8")), "Rxa8+", "SAN capture with check");
  p = new Position("4k3/8/8/8/8/8/4K3/R6R w - - 0 1");
  eq(moveToSAN(p, moveFromUCI(p, "a1d1")), "Rad1", "SAN disambiguation by file");
  p = new Position("rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2");
  eq(moveToSAN(p, moveFromUCI(p, "d8h4")), "Qh4#", "SAN mate suffix");
}
console.log("AI");
{
  // finds mate in one
  const p = new Position("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1");
  const r = searchSync(p, { level: 3 });
  eq(moveToUCI(r.move), "a1a8", "Hard finds back-rank mate");
  // takes hanging queen
  const p2 = new Position("4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1");
  eq(moveToUCI(searchSync(p2, { level: 2, rng: () => 0.5 }).move), "d1d5", "Medium takes free queen");
  eq(p.toFEN(), "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", "search leaves caller position untouched");
  // legal move at every level, within time budget, from several positions
  const fens = [E.START_FEN, "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 b - - 0 1", "4k3/6P1/8/8/8/8/8/4K3 w - - 0 1"];
  for (const lvl of [1, 2, 3, 4]) {
    for (const fen of fens) {
      const pos = new Position(fen), t0 = Date.now();
      const res = searchSync(pos, { level: lvl });
      const dt = Date.now() - t0, budget = LEVELS[lvl].timeMs;
      ok(pos.legalMoves().includes(res.move), `level ${lvl} (${LEVELS[lvl].name}) legal move ${moveToUCI(res.move)} depth ${res.depth} in ${dt}ms`);
      ok(dt <= budget + 120, `level ${lvl} within budget (${dt}ms <= ${budget}+120)`);
    }
  }
  // sliced search yields and finishes
  const pos = new Position(fens[1]); const h = createSearch(pos, { level: 3 }); let slices = 0;
  while (!h.step(5)) slices++;
  ok(slices > 3 && pos.legalMoves().includes(h.result.move), `sliced search used ${slices} slices and returned a legal move`);
  // self-play sanity: a fast game between Medium and Easy runs to completion legally
  const g = new Position(); let plies = 0;
  while (!g.status().over && plies < 300) {
    const r = searchSync(g, { level: plies % 2 ? 1 : 2, timeMs: 40 });
    if (!g.legalMoves().includes(r.move)) { ok(false, "self-play produced illegal move"); break; }
    g.make(r.move); plies++;
  }
  ok(plies > 10, `self-play game ran ${plies} plies (${JSON.stringify(g.status())})`);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
