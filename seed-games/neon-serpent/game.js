// Neon Serpent — an Arcadia seed game. Fork it and make it better!
(() => {
  const W = 640, H = 700, N = 24, CELL = 25, OX = (W - N * CELL) / 2, OY = 80;
  const c = document.getElementById("c");
  const ctx = c.getContext("2d");
  function fit() {
    const s = Math.min(innerWidth / W, innerHeight / H), d = window.devicePixelRatio || 1;
    c.style.width = W * s + "px"; c.style.height = H * s + "px";
    c.width = Math.round(W * s * d); c.height = Math.round(H * s * d);
    ctx.setTransform(s * d, 0, 0, s * d, 0, 0);
  }
  addEventListener("resize", fit); fit();

  const best = () => Number(localStorage.getItem("serpent.best") || 0);
  let state = "title", snake, dir, queue, food, bonus, score, stepTime, acc, grow, flash = 0, t = 0, paused = false;

  function reset() {
    snake = [{ x: 8, y: 12 }, { x: 7, y: 12 }, { x: 6, y: 12 }];
    dir = { x: 1, y: 0 }; queue = []; score = 0; stepTime = 0.13; acc = 0; grow = 0; bonus = null;
    placeFood(); state = "play";
  }
  function freeCell() {
    for (;;) {
      const p = { x: (Math.random() * N) | 0, y: (Math.random() * N) | 0 };
      if (!snake.some((s) => s.x === p.x && s.y === p.y) && !(food && food.x === p.x && food.y === p.y)) return p;
    }
  }
  function placeFood() { food = freeCell(); }

  function turn(x, y) {
    if (state !== "play") { reset(); return; }
    const lastDir = queue.length ? queue[queue.length - 1] : dir;
    if (lastDir.x === -x && lastDir.y === -y) return;
    if (lastDir.x === x && lastDir.y === y) return;
    if (queue.length < 3) queue.push({ x, y });
  }
  const KEYS = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] };
  addEventListener("keydown", (e) => {
    if (KEYS[e.key]) { turn(...KEYS[e.key]); e.preventDefault(); }
    else if ((e.key === " " || e.key === "Enter") && state !== "play") reset();
  });
  let touch = null;
  c.addEventListener("pointerdown", (e) => { touch = { x: e.clientX, y: e.clientY }; if (state !== "play") reset(); });
  addEventListener("pointermove", (e) => {
    if (!touch) return;
    const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
    if (Math.hypot(dx, dy) > 24) {
      Math.abs(dx) > Math.abs(dy) ? turn(Math.sign(dx), 0) : turn(0, Math.sign(dy));
      touch = { x: e.clientX, y: e.clientY };
    }
  });
  addEventListener("pointerup", () => (touch = null));
  if (window.Arcadia) { Arcadia.onPause(() => (paused = true)); Arcadia.onResume(() => (paused = false)); }

  function step() {
    if (queue.length) dir = queue.shift();
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (head.x < 0 || head.y < 0 || head.x >= N || head.y >= N || snake.some((s, i) => i < snake.length - (grow ? 0 : 1) && s.x === head.x && s.y === head.y)) {
      state = "over"; flash = 1;
      if (score > best()) localStorage.setItem("serpent.best", String(score));
      if (window.Arcadia) { Arcadia.submitScore(score); Arcadia.gameOver(); }
      return;
    }
    snake.unshift(head);
    if (grow > 0) grow--; else snake.pop();
    if (head.x === food.x && head.y === food.y) {
      score += 10; grow += 2; placeFood();
      stepTime = Math.max(0.055, stepTime * 0.975);
      if (!bonus && Math.random() < 0.25) bonus = { ...freeCell(), ttl: 6 };
    }
    if (bonus && head.x === bonus.x && head.y === bonus.y) { score += 50; grow += 4; bonus = null; flash = 0.4; }
  }

  function update(dt) {
    t += dt; flash = Math.max(0, flash - dt * 2);
    if (state !== "play") return;
    if (bonus && (bonus.ttl -= dt) <= 0) bonus = null;
    acc += dt;
    while (acc >= stepTime && state === "play") { acc -= stepTime; step(); }
  }

  function draw() {
    ctx.fillStyle = "#050814"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#0b1230"; ctx.fillRect(OX, OY, N * CELL, N * CELL);
    ctx.strokeStyle = "rgba(80,120,255,.08)"; ctx.lineWidth = 1;
    for (let i = 0; i <= N; i++) {
      ctx.beginPath(); ctx.moveTo(OX + i * CELL, OY); ctx.lineTo(OX + i * CELL, OY + N * CELL); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(OX, OY + i * CELL); ctx.lineTo(OX + N * CELL, OY + i * CELL); ctx.stroke();
    }
    ctx.strokeStyle = "#3a5cff"; ctx.lineWidth = 2; ctx.strokeRect(OX, OY, N * CELL, N * CELL);

    if (snake) {
      const pulse = 0.6 + 0.4 * Math.sin(t * 6);
      ctx.shadowBlur = 18; ctx.shadowColor = "#ff3df0";
      ctx.fillStyle = "#ff3df0";
      ctx.beginPath(); ctx.arc(OX + food.x * CELL + CELL / 2, OY + food.y * CELL + CELL / 2, 7 + pulse * 2, 0, Math.PI * 2); ctx.fill();
      if (bonus) {
        ctx.shadowColor = "#ffd23f"; ctx.fillStyle = "#ffd23f";
        ctx.globalAlpha = bonus.ttl < 2 ? 0.4 + 0.6 * Math.abs(Math.sin(t * 10)) : 1;
        ctx.beginPath(); ctx.arc(OX + bonus.x * CELL + CELL / 2, OY + bonus.y * CELL + CELL / 2, 10, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.shadowColor = "#2ef2ff";
      snake.forEach((s, i) => {
        const k = 1 - i / (snake.length + 6);
        ctx.fillStyle = `hsl(${185 - i * 2}, 100%, ${45 + k * 20}%)`;
        const pad = i === 0 ? 1 : 3;
        ctx.beginPath();
        ctx.roundRect(OX + s.x * CELL + pad, OY + s.y * CELL + pad, CELL - pad * 2, CELL - pad * 2, 6);
        ctx.fill();
      });
      ctx.shadowBlur = 0;
      const h = snake[0];
      ctx.fillStyle = "#050814";
      const ex = dir.y !== 0 ? 5 : 0, ey = dir.x !== 0 ? 5 : 0;
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(OX + h.x * CELL + CELL / 2 + dir.x * 5 + sgn * ex, OY + h.y * CELL + CELL / 2 + dir.y * 5 + sgn * ey, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.fillStyle = "#e6f0ff"; ctx.font = "800 26px system-ui"; ctx.textBaseline = "middle";
    ctx.textAlign = "left"; ctx.fillText("NEON SERPENT", OX, 42);
    ctx.textAlign = "right"; ctx.font = "700 22px system-ui"; ctx.fillText(`${score ?? 0}  ·  best ${best()}`, OX + N * CELL, 42);
    if (flash) { ctx.fillStyle = `rgba(255,61,240,${flash * 0.25})`; ctx.fillRect(0, 0, W, H); }

    if (state !== "play") {
      ctx.fillStyle = "rgba(5,8,20,.75)"; ctx.fillRect(OX, OY, N * CELL, N * CELL);
      ctx.fillStyle = "#fff"; ctx.textAlign = "center";
      ctx.font = "900 54px system-ui"; ctx.fillText(state === "over" ? "GAME OVER" : "NEON SERPENT", W / 2, OY + 250);
      ctx.font = "600 20px system-ui"; ctx.fillStyle = "#9fb4ff";
      ctx.fillText(state === "over" ? `Score ${score}` : "Eat the pink orbs. Gold ones are worth 50.", W / 2, OY + 310);
      ctx.fillText("Arrow keys / WASD or swipe  ·  tap to start", W / 2, OY + 345);
    }
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!paused) update(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
