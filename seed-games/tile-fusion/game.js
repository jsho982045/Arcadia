// Tile Fusion — an Arcadia seed game. Slide, merge, reach 2048. Fork it and make it better!
(() => {
  const W = 520, H = 680, N = 4, PAD = 14, BOARD = 480, OX = 20, OY = 170, CS = (BOARD - PAD * (N + 1)) / N;
  const c = document.getElementById("c");
  const ctx = c.getContext("2d");
  function fit() {
    const s = Math.min(innerWidth / W, innerHeight / H), d = window.devicePixelRatio || 1;
    c.style.width = W * s + "px"; c.style.height = H * s + "px";
    c.width = Math.round(W * s * d); c.height = Math.round(H * s * d);
    ctx.setTransform(s * d, 0, 0, s * d, 0, 0);
  }
  addEventListener("resize", fit); fit();

  const COLORS = { 2: "#eee4da", 4: "#ede0c8", 8: "#f2b179", 16: "#f59563", 32: "#f67c5f", 64: "#f65e3b", 128: "#edcf72", 256: "#edcc61", 512: "#9d4edd", 1024: "#7b2cbf", 2048: "#ff006e" };
  const best = () => Number(localStorage.getItem("fusion.best") || 0);
  let tiles, score, over, won, keepGoing, nextId = 1;

  // Resume a game in progress if the player has one saved.
  function saveGame() {
    localStorage.setItem("fusion.game", JSON.stringify({ tiles: tiles.map(({ r, c, v }) => ({ r, c, v })), score }));
  }
  function newGame() {
    tiles = []; score = 0; over = false; won = false; keepGoing = false;
    spawn(); spawn(); saveGame();
  }
  function load() {
    try {
      const g = JSON.parse(localStorage.getItem("fusion.game") || "null");
      if (g && g.tiles && g.tiles.length) {
        tiles = g.tiles.map((t) => ({ ...t, id: nextId++, x: t.c, y: t.r, pop: 0 }));
        score = g.score || 0; over = false; won = false; keepGoing = tiles.some((t) => t.v >= 2048);
        return;
      }
    } catch (e) {}
    newGame();
  }
  const at = (r, c) => tiles.find((t) => t.r === r && t.c === c && !t.dead);
  function spawn() {
    const free = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!at(r, c)) free.push([r, c]);
    if (!free.length) return;
    const [r, c] = free[(Math.random() * free.length) | 0];
    tiles.push({ id: nextId++, r, c, x: c, y: r, v: Math.random() < 0.9 ? 2 : 4, pop: 0.01 });
  }

  function move(dr, dc) {
    if (over || (won && !keepGoing)) return;
    tiles = tiles.filter((t) => !t.dead);
    let moved = false;
    const order = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) order.push([dr === 1 ? N - 1 - i : i, dc === 1 ? N - 1 - j : j]);
    const merged = new Set();
    for (const [r, c] of order) {
      const t = at(r, c);
      if (!t) continue;
      let nr = r, nc = c;
      for (;;) {
        const tr = nr + dr, tc = nc + dc;
        if (tr < 0 || tc < 0 || tr >= N || tc >= N) break;
        const o = at(tr, tc);
        if (!o) { nr = tr; nc = tc; continue; }
        if (o.v === t.v && !merged.has(o.id) && !merged.has(t.id)) {
          nr = tr; nc = tc;
          o.dead = true; t.v *= 2; t.pop = 1; merged.add(t.id);
          score += t.v;
          if (t.v === 2048 && !keepGoing) won = true;
        }
        break;
      }
      if (nr !== r || nc !== c) { t.r = nr; t.c = nc; moved = true; }
    }
    if (!moved) return;
    spawn();
    if (score > best()) localStorage.setItem("fusion.best", String(score));
    if (!canMove()) {
      over = true;
      localStorage.removeItem("fusion.game");
      if (window.Arcadia) { Arcadia.submitScore(score); Arcadia.gameOver(); }
    } else saveGame();
    if (won && window.Arcadia) Arcadia.submitScore(score);
  }
  function canMove() {
    const live = tiles.filter((t) => !t.dead);
    if (live.length < N * N) return true;
    for (const t of live) {
      const r = at(t.r, t.c + 1), d = at(t.r + 1, t.c);
      if ((r && r.v === t.v) || (d && d.v === t.v)) return true;
    }
    return false;
  }

  const KEYS = { ArrowUp: [-1, 0], w: [-1, 0], ArrowDown: [1, 0], s: [1, 0], ArrowLeft: [0, -1], a: [0, -1], ArrowRight: [0, 1], d: [0, 1] };
  addEventListener("keydown", (e) => {
    if (KEYS[e.key]) { move(...KEYS[e.key]); e.preventDefault(); }
    if (e.key === "r") newGame();
    if ((e.key === "Enter" || e.key === " ") && (over || won)) { if (won && !over) keepGoing = true; else newGame(); }
  });
  let start = null;
  function local(e) { const r = c.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; }
  c.addEventListener("pointerdown", (e) => {
    const p = local(e);
    if (p.x > W - 150 && p.y > 100 && p.y < 150) { newGame(); return; }
    if (over) { newGame(); return; }
    if (won && !keepGoing) { keepGoing = true; return; }
    start = { x: e.clientX, y: e.clientY };
  });
  addEventListener("pointerup", (e) => {
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    start = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 25) return;
    Math.abs(dx) > Math.abs(dy) ? move(0, Math.sign(dx)) : move(Math.sign(dy), 0);
  });

  function rr(x, y, w, h, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }

  function draw(dt) {
    ctx.fillStyle = "#1a1426"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.font = "900 40px system-ui"; ctx.fillText("Tile Fusion", OX, 58);
    ctx.font = "500 16px system-ui"; ctx.fillStyle = "#b8a9d9"; ctx.fillText("Merge matching tiles to reach 2048.", OX, 102);
    ctx.fillText("Arrows / WASD / swipe", OX, 126);
    rr(W - 230, 30, 100, 56, 10, "#2f2545"); rr(W - 120, 30, 100, 56, 10, "#2f2545");
    ctx.textAlign = "center"; ctx.fillStyle = "#b8a9d9"; ctx.font = "700 12px system-ui";
    ctx.fillText("SCORE", W - 180, 46); ctx.fillText("BEST", W - 70, 46);
    ctx.fillStyle = "#fff"; ctx.font = "800 22px system-ui";
    ctx.fillText(score, W - 180, 70); ctx.fillText(Math.max(best(), score), W - 70, 70);
    rr(W - 150, 104, 130, 42, 10, "#ff006e"); ctx.fillStyle = "#fff"; ctx.font = "800 16px system-ui"; ctx.fillText("New game", W - 85, 126);

    rr(OX, OY, BOARD, BOARD, 16, "#2f2545");
    for (let r = 0; r < N; r++) for (let c2 = 0; c2 < N; c2++) rr(OX + PAD + c2 * (CS + PAD), OY + PAD + r * (CS + PAD), CS, CS, 10, "#3d3259");
    const k = Math.min(1, dt * 22);
    for (const t of [...tiles].sort((a, b) => (a.dead ? -1 : 0) - (b.dead ? -1 : 0))) {
      t.x += (t.c - t.x) * k; t.y += (t.r - t.y) * k;
      if (Math.abs(t.c - t.x) < 0.01) t.x = t.c;
      if (Math.abs(t.r - t.y) < 0.01) t.y = t.r;
      if (t.pop) t.pop = Math.max(0, t.pop - dt * 5);
      const grow = t.pop > 0 && t.pop < 1 ? 1 + Math.sin(t.pop * Math.PI) * 0.12 : 1;
      const size = CS * grow;
      const x = OX + PAD + t.x * (CS + PAD) + (CS - size) / 2, y = OY + PAD + t.y * (CS + PAD) + (CS - size) / 2;
      rr(x, y, size, size, 10, COLORS[t.v] || "#3c096c");
      ctx.fillStyle = t.v <= 4 ? "#5b4d6e" : "#fff";
      ctx.font = `900 ${t.v < 100 ? 48 : t.v < 1000 ? 40 : 32}px system-ui`;
      ctx.fillText(t.v, x + size / 2, y + size / 2 + 2);
    }
    if (tiles.some((t) => t.dead && t.x === t.c && t.y === t.r)) tiles = tiles.filter((t) => !t.dead || t.x !== t.c || t.y !== t.r);

    if (over || (won && !keepGoing)) {
      rr(OX, OY, BOARD, BOARD, 16, "rgba(26,20,38,.8)");
      ctx.fillStyle = "#fff"; ctx.font = "900 48px system-ui";
      ctx.fillText(over ? "No moves left" : "You made 2048!", W / 2, OY + BOARD / 2 - 20);
      ctx.font = "600 18px system-ui"; ctx.fillStyle = "#e0d4ff";
      ctx.fillText(over ? "Tap to try again" : "Tap to keep going", W / 2, OY + BOARD / 2 + 30);
    }
  }

  load();
  let last = performance.now();
  function loop(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; draw(dt); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
})();
