import { createRequire } from 'module';
import assert from 'assert';
const require = createRequire(import.meta.url);
const E = require('../../seed-games/backgammon-club/engine.js');
let passed = 0;
const queue = [];
function test(name, fn) { queue.push([name, fn]); }
const empty = () => ({ pts: new Array(24).fill(0), bar: [0, 0], off: [0, 0] });
function fill(s, p) { // top up borne-off counts so totals are 15
  for (const q of [0, 1]) { let n = E.checkerCount(s, q); if (n < 15) s.off[q] += 15 - n; }
  return s;
}
const total = (s, p) => E.checkerCount(s, p);

test('initial position', () => {
  const s = E.newState();
  assert.equal(total(s, 0), 15); assert.equal(total(s, 1), 15);
  assert.equal(s.pts[23], 2); assert.equal(s.pts[12], 5); assert.equal(s.pts[7], 3); assert.equal(s.pts[5], 5);
  assert.equal(s.pts[0], -2); assert.equal(s.pts[11], -5); assert.equal(s.pts[16], -3); assert.equal(s.pts[18], -5);
  assert.equal(E.pips(s, 0), 167); assert.equal(E.pips(s, 1), 167);
});
test('opening 3-1 has 16 distinct plays, 6-5 has 7 (dedup by position)', () => {
  const s = E.newState();
  const p31 = E.genPlays(s, 0, [3, 1]);
  assert.equal(p31.length, 16);
  assert.ok(p31.every((p) => p.moves.length === 2));
  // the classic 8/5 6/5 (making the 5 point) must be present
  assert.ok(p31.some((p) => p.state.pts[4] === 2));
  const p65 = E.genPlays(s, 0, [6, 5]);
  assert.equal(p65.length, 7); // 6/1 is blocked by black's anchor
  // 6-5 : 24/13 (lover's leap) present
  assert.ok(p65.some((p) => p.state.pts[23] === 1 && p.state.pts[12] === 6));
  // black's 6 from the 6pt is blocked (idx 0 + 6 = 6 empty ok; but idx 11+6=17 empty), just check symmetry
  assert.equal(E.genPlays(s, 1, [3, 1]).length, p31.length);
  assert.equal(E.genPlays(s, 1, [6, 5]).length, p65.length);
});
test('blocked points cannot be landed on', () => {
  const s = E.newState();
  // white 6pt(idx5) with a 6 -> idx -1 not allowed; white 24pt(idx23) with 6 -> idx17 open; with 5 -> idx18 blocked by black 5 checkers
  const m5 = E.singleMoves(s, 0, 5);
  assert.ok(!m5.some((m) => m.f === 23));
  assert.ok(m5.some((m) => m.f === 12 && m.t === 7));
});
test('doubles give four moves', () => {
  const s = E.newState();
  const pl = E.genPlays(s, 0, [2, 2]);
  assert.ok(pl.length > 5);
  assert.ok(pl.every((p) => p.moves.length === 4));
  assert.equal(E.turnDice([4, 4]).length, 4);
  const one = E.legalMoves(s, 0, E.turnDice([2, 2]), 4, 0);
  assert.ok(one.length > 0 && one.every((m) => m.d === 2));
});
test('bar entry forced before other moves', () => {
  const s = E.newState(); s.pts[12] = 4; s.bar[0] = 1;
  const ms = E.legalMoves(s, 0, [3, 1], E.maxPlay(s, 0, [3, 1]), 0);
  assert.ok(ms.length > 0 && ms.every((m) => m.f === E.BAR));
  const pl = E.genPlays(s, 0, [3, 1]);
  assert.ok(pl.every((p) => p.moves[0].f === E.BAR));
  // white enters with die d at idx 24-d
  assert.ok(ms.some((m) => m.t === 21 && m.d === 3)); assert.ok(ms.some((m) => m.t === 23 && m.d === 1));
});
test('closed board: no entry, no moves', () => {
  const s = empty(); s.bar[0] = 1; s.pts[12] = 14;
  for (let i = 18; i < 24; i++) s.pts[i] = -2; s.pts[11] = -3;
  fill(s);
  assert.equal(E.genPlays(s, 0, [3, 4]).length, 0);
  assert.equal(E.maxPlay(s, 0, [3, 4]), 0);
});
test('hit handling: blot goes to bar', () => {
  const s = empty(); s.pts[10] = 2; s.pts[7] = -1; s.pts[20] = -13; fill(s);
  const m = E.singleMoves(s, 0, 3).find((x) => x.f === 10);
  assert.ok(m.hit && m.t === 7);
  const n = E.applyMove(s, 0, m);
  assert.equal(n.pts[7], 1); assert.equal(n.bar[1], 1); assert.equal(total(n, 1), 15); assert.equal(total(n, 0), 15);
  // hitting black blot entering: black on bar entering onto white blot
  const s2 = empty(); s2.bar[1] = 1; s2.pts[2] = 1; s2.pts[10] = 14; fill(s2);
  const m2 = E.singleMoves(s2, 1, 3);
  assert.equal(m2.length, 1); assert.ok(m2[0].hit && m2[0].t === 2);
});
test('bear-off requires all checkers home', () => {
  const s = empty(); s.pts[0] = 5; s.pts[3] = 5; s.pts[8] = 1; s.pts[20] = -15; fill(s);
  assert.ok(!E.allHome(s, 0));
  assert.ok(!E.singleMoves(s, 0, 6).some((m) => m.t === E.OFF));
  s.pts[8] = 0; s.off[0] = 4; assert.ok(E.allHome(s, 0));
  assert.ok(E.singleMoves(s, 0, 1).some((m) => m.t === E.OFF && m.f === 0));
  // bar checker blocks bearing off
  const s3 = empty(); s3.pts[0] = 14; s3.bar[0] = 1; s3.pts[20] = -15;
  assert.ok(!E.allHome(s3, 0));
});
test('bear-off exact and higher die rules', () => {
  const s = empty(); s.pts[1] = 3; s.pts[3] = 2; s.pts[20] = -15; fill(s); // white on 2pt and 4pt
  // die 6: farthest is idx3 -> allowed only from idx3
  let ms = E.singleMoves(s, 0, 6).filter((m) => m.t === E.OFF);
  assert.deepEqual(ms.map((m) => m.f), [3]);
  // die 5: same
  ms = E.singleMoves(s, 0, 5).filter((m) => m.t === E.OFF);
  assert.deepEqual(ms.map((m) => m.f), [3]);
  // die 4 exact from idx3 only (idx1 is lower: no higher-die use since idx3 has checkers; and 4 is not > dist of idx3)
  ms = E.singleMoves(s, 0, 4).filter((m) => m.t === E.OFF);
  assert.deepEqual(ms.map((m) => m.f), [3]);
  // die 3: cannot bear off idx1 with a 3 since higher point occupied
  ms = E.singleMoves(s, 0, 3).filter((m) => m.t === E.OFF);
  assert.equal(ms.length, 0);
  // once the 4pt is clear, a 5 bears off the 2pt
  const s2 = empty(); s2.pts[1] = 3; s2.pts[20] = -15; fill(s2);
  ms = E.singleMoves(s2, 0, 5).filter((m) => m.t === E.OFF);
  assert.deepEqual(ms.map((m) => m.f), [1]);
  // black mirrored: black home idx 18-23; farthest = lowest idx
  const b = empty(); b.pts[22] = -2; b.pts[3] = 15; fill(b);
  ms = E.singleMoves(b, 1, 6).filter((m) => m.t === E.OFF);
  assert.deepEqual(ms.map((m) => m.f), [22]);
  assert.ok(E.singleMoves(b, 1, 2).some((m) => m.t === E.OFF && m.f === 22));
});
test('must play larger die when only one can be played', () => {
  // White checker on idx 7 alone (rest home is irrelevant). Make so playing 6 first blocks the 1 and vice versa.
  const s = empty();
  s.pts[6] = 1;            // white checker 7pt
  s.off[0] = 14;
  // black blocks: idx 5 (dist 1) blocked? we want: 1 playable, 6 playable, but not both
  s.pts[5] = -2;           // blocks the 1 from idx6 -> so die 1 isn't playable first
  s.pts[0] = -2;           // idx0 = 6 away from idx6 -> blocked
  s.pts[20] = -11; 
  // die 6 blocked, die 1 blocked. make different: only larger playable after? craft explicit scenario below
  fill(s);
  // scenario: white checker at idx 9. die 4 -> idx5 open, die 6 -> idx3 open, but after either, other die is blocked
  const t = empty(); t.pts[9] = 1; t.off[0] = 14;
  t.pts[20] = -2; t.pts[19] = -2; t.pts[16] = -11;
  // block from idx5 : idx5-6=-1 (not all home so illegal); from idx3: minus 4 = -1 illegal. Both leave the checker un-bearable -> after first, other die: idx5 with 6 => off? home yes => bearing off is allowed!
  // Use instead a non-home checker: keep a far white checker so bearing off is disallowed.
  const u = empty(); u.pts[23] = 1; u.pts[9] = 1; u.off[0] = 13; u.pts[16] = -15;
  // idx9: die 4 -> idx5, die 6 -> idx3 ; idx23: die 4 -> 19, die 6 -> 17 (both open) -> too many plays. Restrict idx23 by blocking:
  u.pts[19] = 0; u.pts[16] = -13; u.pts[19] = -2; u.pts[17] = -0; u.pts[17] = 0;
  // block idx23-4=19 (black 2 there) and idx23-6=17 with black 2
  u.pts[16] = -11; u.pts[17] = -2;
  // now idx9 moves: 4->5, 6->3. After 4->5, die 6: 5-6 <0 illegal (not home since idx23). After 6->3, die 4: 3-4<0 illegal. So only one die playable.
  const dice = [4, 6];
  assert.equal(E.maxPlay(u, 0, dice), 1);
  const ms = E.legalMoves(u, 0, dice, 1, 0);
  assert.ok(ms.length > 0 && ms.every((m) => m.d === 6), JSON.stringify(ms));
  const pl = E.genPlays(u, 0, dice);
  assert.ok(pl.length === 1 && pl[0].moves[0].d === 6);
  // when the larger die is unplayable, the smaller must be played
  const v = E.clone(u); v.pts[3] = -2; v.pts[16] = -9;
  const ms2 = E.legalMoves(v, 0, dice, E.maxPlay(v, 0, dice), 0);
  assert.ok(ms2.length > 0 && ms2.every((m) => m.d === 4));
});
test('must use both dice when possible (legalMoves filters dead-end moves)', () => {
  const u = E.newState();
  const dice = [6, 5]; const ml = E.maxPlay(u, 0, dice);
  assert.equal(ml, 2);
  // a state where one first move would lose the second die: white idx9 with 4/6 example from above but with idx23 open
  const s = empty(); s.pts[9] = 1; s.pts[23] = 1; s.off[0] = 13; s.pts[16] = -13; s.pts[17] = -2; s.pts[19] = -0;
  fill(s);
  const ms = E.legalMoves(s, 0, [4, 6], E.maxPlay(s, 0, [4, 6]), 0);
  assert.ok(ms.length > 0);
  for (const m of ms) { const rest = E.remainingDice([4, 6], [m]); assert.ok(1 + E.maxPlay(E.applyMove(s, 0, m), 0, rest) >= E.maxPlay(s, 0, [4, 6])); }
});
test('gammon and backgammon detection', () => {
  let s = empty(); s.off[0] = 15; s.off[1] = 3; s.pts[10] = -12;
  let r = E.gameResult(s); assert.equal(r.winner, 0); assert.equal(r.mult, 1); assert.equal(r.kind, 'single');
  s = empty(); s.off[0] = 15; s.pts[15] = -15;
  r = E.gameResult(s); assert.equal(r.mult, 2); assert.equal(r.kind, 'gammon');
  s = empty(); s.off[0] = 15; s.pts[2] = -1; s.pts[15] = -14;
  r = E.gameResult(s); assert.equal(r.mult, 3); assert.equal(r.kind, 'backgammon');
  s = empty(); s.off[0] = 15; s.bar[1] = 1; s.pts[15] = -14;
  assert.equal(E.gameResult(s).mult, 3);
  s = empty(); s.off[1] = 15; s.pts[21] = 1; s.pts[10] = 14;
  r = E.gameResult(s); assert.equal(r.winner, 1); assert.equal(r.mult, 3);
  s = empty(); s.off[1] = 15; s.pts[10] = 15;
  assert.equal(E.gameResult(s).mult, 2);
  assert.equal(E.gameResult(E.newState()), null);
});
test('opening roll never ties and dice are 1..6', () => {
  const rng = E.makeRng(7);
  for (let i = 0; i < 500; i++) { const o = E.openingRoll(rng); assert.notEqual(o.dice[0], o.dice[1]); assert.equal(o.first, o.dice[0] > o.dice[1] ? 0 : 1); }
  const cnt = [0, 0, 0, 0, 0, 0, 0]; for (let i = 0; i < 6000; i++) cnt[E.rollDie(rng)]++;
  for (let d = 1; d <= 6; d++) assert.ok(cnt[d] > 800 && cnt[d] < 1200);
});
function playGame(rng, pickPlay) {
  let s = E.newState(); const o = E.openingRoll(rng); let turn = o.first, dice = o.dice, turns = 0;
  for (;;) {
    const plays = E.genPlays(s, turn, dice);
    if (plays.length) {
      const pl = pickPlay(s, turn, dice, plays);
      // validate stepwise with legalMoves
      let cur = s; const maxLen = E.maxPlay(s, turn, E.turnDice(dice));
      assert.equal(pl.moves.length, maxLen);
      pl.moves.forEach((m, i) => {
        const rem = E.remainingDice(dice, pl.moves.slice(0, i));
        const lm = E.legalMoves(cur, turn, rem, maxLen, i);
        assert.ok(lm.some((x) => x.f === m.f && x.t === m.t && x.d === m.d), 'move not legal stepwise ' + JSON.stringify({s: cur, turn, dice, m, i, lm, all: pl.moves}));
        cur = E.applyMove(cur, turn, m);
      });
      assert.equal(E.key(cur), E.key(pl.state));
      s = pl.state;
    }
    for (const p of [0, 1]) assert.equal(E.checkerCount(s, p), 15, 'conservation');
    if (E.winner(s) >= 0) break;
    turn = 1 - turn; dice = E.rollDice(rng); turns++;
    assert.ok(turns < 2000, 'runaway game');
  }
  return { s, r: E.gameResult(s), turns };
}
test('200 random self-play games terminate with valid winner and 15 checkers each', () => {
  const rng = E.makeRng(12345); let w = [0, 0], kinds = {};
  for (let g = 0; g < 200; g++) {
    const { s, r } = playGame(rng, (s, t, d, plays) => plays[Math.floor(rng() * plays.length)]);
    assert.ok(r && (r.winner === 0 || r.winner === 1)); assert.equal(s.off[r.winner], 15); assert.ok(s.off[1 - r.winner] < 15);
    w[r.winner]++; kinds[r.kind] = (kinds[r.kind] || 0) + 1;
  }
  console.log('     wins', w, kinds);
});
test('medium AI beats random clearly', () => {
  const rng = E.makeRng(99); let med = 0; const N = 60;
  for (let g = 0; g < N; g++) {
    const medSide = g % 2;
    const { r } = playGame(rng, (s, t, d, plays) => t === medSide ? E.choosePlay(s, t, d, 'medium', rng) : plays[Math.floor(rng() * plays.length)]);
    if (r.winner === medSide) med++;
  }
  console.log('     medium won', med, '/', N);
  assert.ok(med >= N * 0.7);
});
test('AI returns legal sequences within budget (all levels)', async () => {
  const rng = E.makeRng(5);
  let s = E.newState(); let turn = 0;
  const times = [];
  for (let i = 0; i < 12; i++) {
    const dice = E.rollDice(rng);
    for (const level of ['easy', 'medium', 'hard']) {
      const t0 = Date.now();
      const pl = await new Promise((res) => E.choosePlayAsync(s, turn, dice, level, { budgetMs: 800, rng }, res));
      const dt = Date.now() - t0; if (level === 'hard') times.push(dt);
      const legal = E.genPlays(s, turn, dice);
      assert.ok(legal.some((x) => E.key(x.state) === E.key(pl.state)), level + ' returned illegal play');
      if (level === 'hard') assert.ok(dt < 800 + 600, 'hard too slow ' + dt);
    }
    const pl = E.choosePlay(s, turn, dice, 'medium', rng); s = pl.state; turn = 1 - turn;
    if (E.winner(s) >= 0) break;
  }
  console.log('     hard AI times ms', times.join(','));
});
test('hard AI is time-sliced (event loop stays responsive)', async () => {
  const s = E.newState(); let maxGap = 0, last = Date.now(); const iv = setInterval(() => { const n = Date.now(); maxGap = Math.max(maxGap, n - last); last = n; }, 2);
  const t0 = Date.now();
  await new Promise((res) => E.choosePlayAsync(s, 0, [2, 2], 'hard', { budgetMs: 1200 }, res));
  clearInterval(iv);
  console.log('     hard [2,2] took', Date.now() - t0, 'ms, max event-loop gap', maxGap, 'ms');
  assert.ok(maxGap < 80, 'max gap ' + maxGap);
});
test('hard AI plays a full game vs medium without illegal plays', async () => {
  const rng = E.makeRng(2024); let s = E.newState(); const o = E.openingRoll(rng); let turn = o.first, dice = o.dice, n = 0;
  while (E.winner(s) < 0 && n < 400) {
    const pl = await new Promise((res) => turn === 0 ? E.choosePlayAsync(s, 0, dice, 'hard', { budgetMs: 150, rng }, res) : res(E.choosePlay(s, 1, dice, 'medium', rng)));
    const legal = E.genPlays(s, turn, dice);
    if (legal.length) assert.ok(legal.some((x) => E.key(x.state) === E.key(pl.state)));
    else assert.equal(pl.moves.length, 0);
    s = pl.state; turn = 1 - turn; dice = E.rollDice(rng); n++;
  }
  assert.ok(E.winner(s) >= 0); assert.equal(E.checkerCount(s, 0), 15); assert.equal(E.checkerCount(s, 1), 15);
  console.log('     hard(0) vs medium(1): winner', E.winner(s), 'in', n, 'turns');
});
test('cube AI sanity', () => {
  const s = E.newState();
  assert.ok(!E.aiShouldDouble(s, 0, 'hard'));
  assert.ok(E.aiShouldTake(s, 1, 'hard'));
  const r = empty(); r.pts[0] = 3; r.pts[19] = -15; r.off[0] = 12; // white almost done, black far
  assert.ok(E.winProb(r, 0) > 0.95);
  assert.ok(!E.aiShouldTake(r, 1, 'hard'));
});
for (const [name, fn] of queue) {
  try { await fn(); passed++; console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + '\n  ' + (e.stack || e)); process.exitCode = 1; }
}
console.log(process.exitCode ? 'SOME TESTS FAILED' : 'ALL TESTS PASSED (' + passed + ')');
