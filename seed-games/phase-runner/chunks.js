// Phase Runner - hand designed chunks + fairness solver.
// Cell legend (one char per lane, rows listed nearest first):
//  . empty   c coin
//  a day block   b night block   (solid only in that world)
//  g day gap     h night gap
//  e day drone   f night drone
(function (root) {
  "use strict";
  var CH = [
    // tier 0 : learn the two worlds
    { t: 0, r: ["a..", "...", "..a", "...", ".a."] },
    { t: 0, r: ["aaa", "...", "...", "bbb"] },
    { t: 0, r: [".b.", "...", "b.b", "...", "..b"] },
    { t: 0, r: ["g..", "...", ".g.", "...", "..g"] },
    { t: 0, r: ["e..", "...", ".e.", "...", "..e"] },
    { t: 0, r: ["hhh", "...", "...", "aaa"] },
    { t: 0, r: ["cc.", ".cc", "c.c", ".cc", "cc."] },
    // tier 1 : mixed worlds
    { t: 1, r: ["aab", "...", "baa", "...", "aba"] },
    { t: 1, r: ["a.b", "...", "b.a", "...", "a.b"] },
    { t: 1, r: ["ggg", "...", "...", "bbb", "...", "hh."] },
    { t: 1, r: ["e.f", "...", "f.e", "...", ".ef"] },
    { t: 1, r: ["abb", "...", ".ab", "...", "ba."] },
    { t: 1, r: ["aaa", "...", "bbb", "...", "aaa"] },
    { t: 1, r: ["..a", "..b", ".a.", ".b.", "a..", "b.."] },
    { t: 1, r: ["g.h", "...", "h.g", "...", "g.h"] },
    // tier 2 : dense
    { t: 2, r: ["aab", "baa", "aab", "baa"] },
    { t: 2, r: ["abb", "bab", "bba", "abb"] },
    { t: 2, r: ["g.h", ".e.", "h.g", "...", "f.e"] },
    { t: 2, r: ["aab", "hgg", "bba", "ggh"] },
    { t: 2, r: ["aaa", "...", "bbb", "aaa"] },
    { t: 2, r: ["e.f", "f.e", "e.f", "...", "hhh", "...", "ggg"] },
    // tier 3 : rapid phase work
    { t: 3, r: ["aaa", ".c.", "bbb", ".c.", "aaa", ".c.", "bbb"] },
    { t: 3, r: ["abb", "aba", "bba", "baa", "aab", "abb"] },
    { t: 3, r: ["aab", "...", "bab", "...", "bba", "...", "aab"] },
    { t: 3, r: ["ggg", "bbb", "hhh", "aaa"] },
    { t: 3, r: ["abf", "bag", "hab", "abe", "fba"] }
  ];
  function safe(row, l, w) {
    var ch = row.charAt(l);
    if (w === 0) return ch !== "a" && ch !== "g" && ch !== "e";
    return ch !== "b" && ch !== "h" && ch !== "f";
  }
  // Returns array of [lane, world] (one per row) or null when unsolvable.
  // Player may change at most one lane and toggle world between consecutive rows.
  function solve(rows, rnd) {
    var layers = [], prev = [1, 1, 1, 1, 1, 1], i, l, w, pl, pw, cur, any;
    for (i = 0; i < rows.length; i++) {
      cur = [0, 0, 0, 0, 0, 0]; any = false;
      for (l = 0; l < 3; l++) for (w = 0; w < 2; w++) {
        if (!safe(rows[i], l, w)) continue;
        for (pl = Math.max(0, l - 1); pl <= Math.min(2, l + 1) && !cur[l * 2 + w]; pl++)
          for (pw = 0; pw < 2; pw++) if (prev[pl * 2 + pw]) { cur[l * 2 + w] = pl * 2 + pw + 1; any = true; break; }
      }
      if (!any) return null;
      layers.push(cur);
      prev = cur.map(function (x) { return x ? 1 : 0; });
    }
    var opts = [];
    layers[layers.length - 1].forEach(function (x, k) { if (x) opts.push(k); });
    var idx = opts[Math.floor((rnd ? rnd() : 0) * opts.length)];
    var path = new Array(rows.length);
    for (i = rows.length - 1; i >= 0; i--) { path[i] = [idx >> 1, idx & 1]; idx = layers[i][idx] - 1; }
    return path;
  }
  root.PR_CHUNKS = CH; root.PR_solve = solve; root.PR_safe = safe;
  if (typeof module !== "undefined") module.exports = { CH: CH, solve: solve, safe: safe };
})(typeof window !== "undefined" ? window : globalThis);
