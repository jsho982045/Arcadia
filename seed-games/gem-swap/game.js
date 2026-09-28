// Gem Swap — an Arcadia seed game. Match 3 or more before the clock runs out. Fork it and make it better!
(() => {
  const W = 560, H = 740, N = 8, CELL = 64, OX = (W - N * CELL) / 2, OY = 170, TYPES = 6, ROUND = 90;
  const c = document.getElementById("c");
  const ctx = c.getContext("2d");
  function fit() {
    const s = Math.min(innerWidth / W, innerHeight / H), d = window.devicePixelRatio || 1;
    c.style.width = W * s + "px"; c.style.height = H * s + "px";
    c.width = Math.round(W * s * d); c.height = Math.round(H * s * d);
    ctx.setTransform(s * d, 0, 0, s * d, 0, 0);
  }
  addEventListener("resize", fit); fit();

  const GEM = [
    { color: "#ff4d6d", shape: "diamond" }, { color: "#ffd23f", shape: "star" }, { color: "#3ddc97", shape: "circle" },
    { color: "#4cc9f0", shape: "square" }, { color: "#b56cff", shape: "hex" }, { color: "#ff9f1c", shape: "tri" },
  ];
  const best = () => Number(localStorage.getItem("gemswap.best") || 0);
  let grid, state = "title", score = 0, timeLeft = ROUND, sel = null, busy = false, combo = 0, particles = [], popups = [], t = 0, paused = false, idle = 0, hint = null;

  const rnd = () => (Math.random() * TYPES) | 0;
  function newGrid() {
    grid = [];
    for (let r = 0; r < N; r++) {
      grid.push([]);
      for (let col = 0; col < N; col++) {
        let tp;
        do tp = rnd();
        while ((col >= 2 && grid[r][col - 1].t === tp && grid[r][col - 2].t === tp) || (r >= 2 && grid[r - 1][col].t === tp && grid[r - 2][col].t === tp));
        grid[r].push({ t: tp, y: r - N - 2, x: col, pop: 0 });
      }
    }
    if (!findMove()) newGrid();
  }
  function start() { score = 0; timeLeft = ROUND; combo = 0; sel = null; busy = false; newGrid(); state = "play"; }

  function allMatches() {
    const hit = new Set();
    for (let r = 0; r < N; r++) {
      let run = 1;
      for (let col = 1; col <= N; col++) {
        if (col < N && grid[r][col].t === grid[r][col - 1].t) run++;
        else { if (run >= 3) for (let k = col - run; k < col; k++) hit.add(r * N + k); run = 1; }
      }
    }
    for (let col = 0; col < N; col++) {
      let run = 1;
      for (let r = 1; r <= N; r++) {
        if (r < N && grid[r][col].t === grid[r - 1][col].t) run++;
        else { if (run >= 3) for (let k = r - run; k < r; k++) hit.add(k * N + col); run = 1; }
      }
    }
    return hit;
  }
  function swap(a, b) { const tmp = grid[a.r][a.c]; grid[a.r][a.c] = grid[b.r][b.c]; grid[b.r][b.c] = tmp; }
  function findMove() {
    for (let r = 0; r < N; r++) for (let col = 0; col < N; col++) for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const r2 = r + dr, c2 = col + dc;
      if (r2 >= N || c2 >= N) continue;
      swap({ r, c: col }, { r: r2, c: c2 });
      const ok = allMatches().size > 0;
      swap({ r, c: col }, { r: r2, c: c2 });
      if (ok) return [{ r, c: col }, { r: r2, c: c2 }];
    }
    return null;
  }
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));

  async function trySwap(a, b) {
    busy = true; idle = 0; hint = null;
    swap(a, b);
    await wait(160);
    if (!allMatches().size) { swap(a, b); await wait(160); busy = false; return; }
    combo = 0;
    for (;;) {
      const hit = allMatches();
      if (!hit.size) break;
      combo++;
      const gained = hit.size * 10 * combo;
      score += gained;
      if (hit.size >= 4) timeLeft = Math.min(ROUND, timeLeft + hit.size - 2);
      let cx = 0, cy = 0;
      for (const k of hit) {
        const r = (k / N) | 0, col = k % N, g = grid[r][col];
        cx += col; cy += r;
        for (let i = 0; i < 6; i++) { const an = Math.random() * 6.28, s = 60 + Math.random() * 160; particles.push({ x: OX + col * CELL + CELL / 2, y: OY + r * CELL + CELL / 2, vx: Math.cos(an) * s, vy: Math.sin(an) * s, life: 0.5, color: GEM[g.t].color }); }
        g.t = -1;
      }
      popups.push({ x: OX + (cx / hit.size) * CELL + CELL / 2, y: OY + (cy / hit.size) * CELL, text: combo > 1 ? `+${gained}  x${combo}` : `+${gained}`, life: 0.9 });
      await wait(140);
      // Gravity: drop gems down, fill from the top.
      for (let col = 0; col < N; col++) {
        let write = N - 1;
        for (let r = N - 1; r >= 0; r--) if (grid[r][col].t >= 0) { const g = grid[r][col]; grid[write][col] = g; write--; }
        for (let r = write; r >= 0; r--) grid[r][col] = { t: rnd(), y: r - (write + 1) - 1, x: col, pop: 0 };
      }
      await wait(260);
    }
    if (!findMove()) { popups.push({ x: W / 2, y: OY + N * CELL / 2, text: "Shuffle!", life: 1.2 }); await wait(400); newGrid(); }
    busy = false;
  }

  function cellAt(e) {
    const r = c.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W - OX, y = ((e.clientY - r.top) / r.height) * H - OY;
    if (x < 0 || y < 0 || x >= N * CELL || y >= N * CELL) return null;
    return { r: (y / CELL) | 0, c: (x / CELL) | 0 };
  }
  let drag = null;
  c.addEventListener("pointerdown", (e) => {
    if (state !== "play") { start(); return; }
    if (busy) return;
    const p = cellAt(e);
    if (!p) return;
    if (sel && Math.abs(sel.r - p.r) + Math.abs(sel.c - p.c) === 1) { const a = sel; sel = null; trySwap(a, p); return; }
    sel = p; drag = { p, x: e.clientX, y: e.clientY };
  });
  addEventListener("pointermove", (e) => {
    if (!drag || busy) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) < 18) return;
    const b = Math.abs(dx) > Math.abs(dy) ? { r: drag.p.r, c: drag.p.c + Math.sign(dx) } : { r: drag.p.r + Math.sign(dy), c: drag.p.c };
    const a = drag.p; drag = null;
    if (b.r >= 0 && b.c >= 0 && b.r < N && b.c < N) { sel = null; trySwap(a, b); }
  });
  addEventListener("pointerup", () => (drag = null));
  addEventListener("keydown", (e) => { if ((e.key === " " || e.key === "Enter") && state !== "play") start(); });
  if (window.Arcadia) { Arcadia.onPause(() => (paused = true)); Arcadia.onResume(() => (paused = false)); }

  function update(dt) {
    t += dt;
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; p.life -= dt; }
    particles = particles.filter((p) => p.life > 0);
    for (const p of popups) { p.life -= dt; p.y -= 40 * dt; }
    popups = popups.filter((p) => p.life > 0);
    if (!grid) return;
    for (let r = 0; r < N; r++) for (let col = 0; col < N; col++) {
      const g = grid[r][col];
      g.y += (r - g.y) * Math.min(1, dt * 14); g.x += (col - g.x) * Math.min(1, dt * 14);
    }
    if (state !== "play") return;
    timeLeft -= dt;
    idle += dt;
    if (idle > 6 && !hint && !busy) hint = findMove();
    if (timeLeft <= 0 && !busy) {
      timeLeft = 0; state = "over";
      if (score > best()) localStorage.setItem("gemswap.best", String(score));
      if (window.Arcadia) { Arcadia.submitScore(score); Arcadia.gameOver(); }
    }
  }

  function gemPath(shape, x, y, s) {
    ctx.beginPath();
    if (shape === "circle") ctx.arc(x, y, s, 0, Math.PI * 2);
    else if (shape === "square") ctx.roundRect(x - s * 0.85, y - s * 0.85, s * 1.7, s * 1.7, 6);
    else if (shape === "diamond") { ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); }
    else if (shape === "tri") { ctx.moveTo(x, y - s); ctx.lineTo(x + s, y + s * 0.8); ctx.lineTo(x - s, y + s * 0.8); }
    else if (shape === "hex") for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ctx[i ? "lineTo" : "moveTo"](x + Math.cos(a) * s, y + Math.sin(a) * s); }
    else for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? s * 0.45 : s; ctx[i ? "lineTo" : "moveTo"](x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath();
  }

  function draw() {
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#241643"); bg.addColorStop(1, "#140d24");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.font = "900 44px system-ui"; ctx.fillText("Gem Swap", OX, 56);
    ctx.font = "700 20px system-ui"; ctx.fillStyle = "#d9c8ff"; ctx.fillText(`Score ${score}`, OX, 108);
    ctx.textAlign = "right"; ctx.fillText(`Best ${Math.max(best(), score)}`, OX + N * CELL, 108);
    // timer bar
    ctx.fillStyle = "#3a2766"; ctx.beginPath(); ctx.roundRect(OX, 132, N * CELL, 14, 7); ctx.fill();
    ctx.fillStyle = timeLeft < 10 ? "#ff4d6d" : "#3ddc97"; ctx.beginPath(); ctx.roundRect(OX, 132, (N * CELL * Math.max(0, timeLeft)) / ROUND, 14, 7); ctx.fill();

    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.roundRect(OX - 8, OY - 8, N * CELL + 16, N * CELL + 16, 16); ctx.fill();
    for (let r = 0; r < N; r++) for (let col = 0; col < N; col++) {
      ctx.fillStyle = (r + col) % 2 ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.08)";
      ctx.fillRect(OX + col * CELL, OY + r * CELL, CELL, CELL);
    }
    if (grid) {
      ctx.save(); ctx.beginPath(); ctx.rect(OX, OY, N * CELL, N * CELL); ctx.clip();
      for (let r = 0; r < N; r++) for (let col = 0; col < N; col++) {
        const g = grid[r][col];
        if (g.t < 0) continue;
        const x = OX + g.x * CELL + CELL / 2, y = OY + g.y * CELL + CELL / 2;
        const isSel = sel && sel.r === r && sel.c === col;
        const isHint = hint && hint.some((h) => h.r === r && h.c === col);
        const s = 22 * (isSel ? 1.12 : 1) * (isHint ? 1 + Math.sin(t * 8) * 0.08 : 1);
        ctx.shadowColor = GEM[g.t].color; ctx.shadowBlur = isSel ? 22 : 8;
        ctx.fillStyle = GEM[g.t].color; gemPath(GEM[g.t].shape, x, y, s); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = "rgba(255,255,255,.35)"; gemPath(GEM[g.t].shape, x - 4, y - 5, s * 0.4); ctx.fill();
      }
      ctx.restore();
    }
    for (const p of particles) { ctx.globalAlpha = p.life * 2; ctx.fillStyle = p.color; ctx.fillRect(p.x - 3, p.y - 3, 6, 6); }
    ctx.globalAlpha = 1; ctx.textAlign = "center"; ctx.font = "900 24px system-ui";
    for (const p of popups) { ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = "#fff"; ctx.fillText(p.text, p.x, p.y); }
    ctx.globalAlpha = 1;

    if (state !== "play") {
      ctx.fillStyle = "rgba(20,13,36,.8)"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff"; ctx.font = "900 56px system-ui"; ctx.fillText(state === "over" ? "Time's up!" : "Gem Swap", W / 2, H / 2 - 50);
      ctx.font = "600 20px system-ui"; ctx.fillStyle = "#d9c8ff";
      ctx.fillText(state === "over" ? `Score ${score}  ·  Best ${best()}` : `Swap gems to match 3+. You have ${ROUND} seconds.`, W / 2, H / 2 + 10);
      ctx.fillText("Big matches add time. Chains multiply points.", W / 2, H / 2 + 44);
      ctx.fillStyle = "#fff"; ctx.fillText("Tap to " + (state === "over" ? "play again" : "start"), W / 2, H / 2 + 96);
    }
  }

  let last = performance.now();
  function loop(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; if (!paused) update(dt); draw(); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
})();
