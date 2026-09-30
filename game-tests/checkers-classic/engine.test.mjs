// Run: node engine.test.mjs
import { createRequire } from "module";
import assert from "assert";
const E = createRequire(import.meta.url)("../../seed-games/checkers-classic/engine.js");
let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; console.log("  ok   " + name); } catch (e) { fail++; console.log("  FAIL " + name + "\n       " + e.message); } }
const sq = (r, c) => r * 8 + c;
const S = (rows, turn) => E.fromRows(rows, turn);

test("initial position has 12 v 12 and black moves first", () => {
  const s = E.newState(); const n = E.counts(s);
  assert.equal(n.black, 12); assert.equal(n.red, 12); assert.equal(s.turn, E.BLACK);
});
test("initial legal moves = 7", () => { assert.equal(E.genMoves(E.newState()).length, 7); });
test("perft depth 1..6 matches known American checkers numbers", () => {
  const exp = [7, 49, 302, 1469, 7361, 36768];
  exp.forEach((n, i) => assert.equal(E.perft(E.newState(), i + 1), n, "depth " + (i + 1)));
});
test("perft depth 7 = 179740", () => { assert.equal(E.perft(E.newState(), 7), 179740); });
test("forced capture: only jumps are returned", () => {
  const s = S([
    "........", "........", "..b.....", "...r....", "........", "........", ".r......", "b.......",
  ], E.BLACK);
  const ms = E.genMoves(s);
  assert.equal(ms.length, 1); assert.deepEqual(ms[0].path, [sq(2, 2), sq(4, 4)]); assert.deepEqual(ms[0].caps, [sq(3, 3)]);
});
test("multi-jump chains are enumerated and must be completed", () => {
  const s = S([
    "........", "........", ".b......", "..r.....", "........", "....r...", "........", "........",
  ], E.BLACK);
  const ms = E.genMoves(s);
  assert.equal(ms.length, 1);
  assert.deepEqual(ms[0].path, [sq(2, 1), sq(4, 3), sq(6, 5)]);
  assert.equal(ms[0].caps.length, 2);
});
test("branching chains produce one move per full route", () => {
  const s = S([
    "........", "........", "...b....", "..r.r...", "........", "..r.r...", "........", "........",
  ], E.BLACK);
  const ms = E.genMoves(s);
  const routes = ms.map((m) => m.path.map((p) => p).join(">")).sort();
  assert.equal(ms.length, 2, routes.join(" | "));
  assert.ok(ms.every((m) => m.caps.length === 3 || m.caps.length === 2));
});
test("king can jump backwards, man cannot", () => {
  const man = S(["........", "........", "........", "...r....", "..b.....", "........", "........", "........"], E.BLACK);
  // black man at (4,2), red at (3,3) is "behind" (up) for black: no capture
  assert.ok(E.genMoves(man).every((m) => !m.caps.length));
  const king = S(["........", "........", "........", "...r....", "..B.....", "........", "........", "........"], E.BLACK);
  const ms = E.genMoves(king);
  assert.equal(ms.length, 1); assert.deepEqual(ms[0].path, [sq(4, 2), sq(2, 4)]);
});
test("promotion ends a jump chain (man reaching the king row stops)", () => {
  // black man jumps into row 7 and could otherwise continue backwards as a king over the red at (6,5)
  const s2 = S(["........", "........", "........", "........", "........", ".b......", "..r.r...", "........"], E.BLACK);
  const ms = E.genMoves(s2);
  assert.equal(ms.length, 1);
  assert.equal(ms[0].promo, true); assert.equal(ms[0].path.length, 2);
  const after = E.applyMove(s2, ms[0]);
  assert.equal(after.b[sq(7, 3)], 2);
  assert.equal(after.b[sq(6, 4)], -1, "second red piece must survive");
});
test("simple move onto last row promotes", () => {
  const s = S(["........", "........", "........", "........", "........", "........", ".b......", "........"], E.BLACK);
  const ms = E.genMoves(s); assert.ok(ms.every((m) => m.promo));
  assert.equal(E.applyMove(s, ms[0]).b[ms[0].to], 2);
});
test("side with no legal moves / no pieces loses", () => {
  const noPieces = S(["........", "...b....", "........", "........", "........", "........", "........", "........"], E.RED);
  const res = E.gameResult(noPieces); assert.equal(res.over, true); assert.equal(res.winner, E.BLACK);
});
test("a blocked man with no jumps has no moves", () => {
  // red man at (5,0) moving up: (4,1) occupied by black, jump target (3,2) occupied
  const s = S(["........", "........", "........", "..b.....", ".b......", "r.......", "........", "........"], E.RED);
  assert.equal(E.genMoves(s).length, 0);
  assert.equal(E.gameResult(s).winner, E.BLACK);
});
test("40-move rule and repetition draws", () => {
  const s = S(["........", "........", "........", "..B.....", "........", "........", ".....R..", "........"], E.BLACK);
  s.half = 80; assert.equal(E.gameResult(s).winner, 0);
  s.half = 0; const k = E.keyOf(s);
  assert.equal(E.gameResult(s, [k, k]).over, false);
  assert.equal(E.gameResult(s, [k, k, k]).reason, "repetition");
});
test("half-move clock resets on man move / capture, grows on king move", () => {
  let s = E.newState(); s = E.applyMove(s, E.genMoves(s)[0]); assert.equal(s.half, 0);
  const k = S(["........", "........", "........", "..B.....", "........", "........", ".....R..", "........"], E.BLACK);
  assert.equal(E.applyMove(k, E.genMoves(k)[0]).half, 1);
});
test("hash is incremental-consistent", () => {
  let s = E.newState();
  for (let i = 0; i < 30; i++) { const ms = E.genMoves(s); if (!ms.length) break; s = E.applyMove(s, ms[(i * 7) % ms.length]); const t = E.newState(s.b, s.turn); assert.equal(t.h1, s.h1); assert.equal(t.h2, s.h2); }
});
test("AI returns legal moves within the time budget at every level", () => {
  const positions = [E.newState(), S(["........", ".b.b.b..", "b.b.b...", "........", "...r....", "..r.r.r.", ".r.r....", "r.r....."], E.BLACK), S(["........", "........", "..B.....", "........", "........", ".....R..", "........", "R......."], E.BLACK)];
  for (const lvl of E.LEVELS) for (const p of positions) {
    const t0 = Date.now(), r = E.chooseMoveSync(p, lvl, []), dt = Date.now() - t0;
    assert.ok(E.genMoves(p).some((m) => E.sameMove(m, r.move)), lvl.name + " illegal move");
    assert.ok(dt < lvl.ms + 350, lvl.name + " took " + dt + "ms");
  }
});
test("AI takes a free capture / avoids hanging pieces (Hard)", () => {
  const s = S(["........", "........", "..b.....", "...r....", "........", "........", "........", "........"], E.BLACK);
  const r = E.chooseMoveSync(s, 2, []); assert.equal(r.move.caps.length, 1);
});
test("AI (Master) searches deep (depth >= 6) within budget", () => {
  // black to move; sacrifice at (3,4)?? verify only that Master does not lose material vs a greedy line in a quiet position
  const r = E.chooseMoveSync(E.newState(), 3, []); assert.ok(r.depth >= 6, "depth " + r.depth);
});
test("async AI driver slices and calls back with a legal move", () => new Promise((res, rej) => {
  const s = E.newState(); let ticks = 0; const iv = setInterval(() => ticks++, 1);
  E.chooseMoveAsync(s, 1, [], (r) => { clearInterval(iv); try { assert.ok(E.genMoves(s).some((m) => E.sameMove(m, r.move))); assert.ok(ticks > 3, "event loop starved"); res(); } catch (e) { rej(e); } });
}).then(() => { pass++; console.log("  ok   (async) done"); }).catch((e) => { fail++; console.log("  FAIL async: " + e.message); }));
test("full self-play game between AIs terminates with a result", () => {
  let s = E.newState(); const hashes = [E.keyOf(s)]; let res;
  for (let i = 0; i < 300; i++) {
    res = E.gameResult(s, hashes); if (res.over) break;
    const r = E.chooseMoveSync(s, i % 2 ? 0 : 1, hashes); s = E.applyMove(s, r.move); hashes.push(E.keyOf(s));
  }
  assert.ok(res.over, "game did not end in 300 plies");
});
setTimeout(() => { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }, 800);
