// Brick Blitz — an Arcadia seed game. Fork it and make it better!
(() => {
  const W = 800, H = 600;
  const c = document.getElementById("c");
  const ctx = c.getContext("2d");
  let scale = 1;
  function fit() {
    scale = Math.min(innerWidth / W, innerHeight / H);
    const dpr = window.devicePixelRatio || 1;
    c.style.width = W * scale + "px";
    c.style.height = H * scale + "px";
    c.width = Math.round(W * scale * dpr);
    c.height = Math.round(H * scale * dpr);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  }
  addEventListener("resize", fit);
  fit();

  const COLORS = ["#ff4d6d", "#ff9f1c", "#ffd23f", "#3ddc97", "#4cc9f0", "#9d4edd"];
  const best = () => Number(localStorage.getItem("brickblitz.best") || 0);

  let state = "title"; // title | play | serve | over | won
  let paddle, balls, bricks, drops, particles, score, lives, level, keys = {}, pointerX = null, shake = 0;

  function reset() {
    score = 0; lives = 3; level = 1;
    buildLevel();
  }

  function buildLevel() {
    paddle = { x: W / 2, y: H - 40, w: 110, h: 14, wideTimer: 0 };
    balls = [];
    drops = [];
    particles = [];
    bricks = [];
    const rows = Math.min(4 + level, 9);
    const cols = 11;
    const bw = 64, bh = 22, gap = 6;
    const ox = (W - (cols * bw + (cols - 1) * gap)) / 2;
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        // Patterns get more interesting each level.
        if (level % 3 === 2 && (r + col) % 4 === 0) continue;
        if (level % 3 === 0 && Math.abs(col - 5) + r < 2) continue;
        const hp = r < level - 1 && r < 3 ? 2 : 1;
        bricks.push({ x: ox + col * (bw + gap), y: 70 + r * (bh + gap), w: bw, h: bh, hp, color: COLORS[r % COLORS.length] });
      }
    }
    serve();
  }

  function serve() {
    state = "serve";
    balls = [{ x: paddle.x, y: paddle.y - 12, vx: 0, vy: 0, r: 8, stuck: true }];
  }

  function launch() {
    for (const b of balls) {
      if (b.stuck) {
        const speed = 380 + level * 25;
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
        b.vx = Math.cos(a) * speed;
        b.vy = Math.sin(a) * speed;
        b.stuck = false;
      }
    }
    state = "play";
  }

  function burst(x, y, color, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 220;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6 + Math.random() * 0.4, color });
    }
  }

  function press() {
    if (state === "title" || state === "over" || state === "won") { reset(); return; }
    if (state === "serve") launch();
  }

  addEventListener("keydown", (e) => {
    keys[e.key] = true;
    if (e.key === " " || e.key === "Enter" || e.key === "ArrowUp") { press(); e.preventDefault(); }
  });
  addEventListener("keyup", (e) => (keys[e.key] = false));
  function toLocal(e) {
    const r = c.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * W;
  }
  c.addEventListener("pointerdown", (e) => { pointerX = toLocal(e); press(); c.focus(); });
  addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" || e.buttons) pointerX = toLocal(e); });

  let paused = false;
  if (window.Arcadia) { Arcadia.onPause(() => (paused = true)); Arcadia.onResume(() => (paused = false)); }

  function update(dt) {
    // Paddle
    const speed = 620;
    if (keys.ArrowLeft || keys.a) { paddle.x -= speed * dt; pointerX = null; }
    if (keys.ArrowRight || keys.d) { paddle.x += speed * dt; pointerX = null; }
    if (pointerX !== null) paddle.x += (pointerX - paddle.x) * Math.min(1, dt * 18);
    if (paddle.wideTimer > 0) { paddle.wideTimer -= dt; paddle.w += (160 - paddle.w) * dt * 8; }
    else paddle.w += (110 - paddle.w) * dt * 8;
    paddle.x = Math.max(paddle.w / 2, Math.min(W - paddle.w / 2, paddle.x));

    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 400 * dt; p.life -= dt; }
    particles = particles.filter((p) => p.life > 0);
    shake = Math.max(0, shake - dt * 30);

    if (state === "serve") { balls[0].x = paddle.x; balls[0].y = paddle.y - 14; return; }
    if (state !== "play") return;

    // Balls (sub-stepped so fast balls don't tunnel through bricks)
    for (const b of balls) {
      const steps = Math.ceil((Math.hypot(b.vx, b.vy) * dt) / 6);
      for (let s = 0; s < steps; s++) {
        const sdt = dt / steps;
        b.x += b.vx * sdt; b.y += b.vy * sdt;
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); }
        if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); }
        if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); }
        // Paddle: angle depends on where the ball hits
        if (b.vy > 0 && b.y + b.r >= paddle.y && b.y + b.r <= paddle.y + paddle.h + 10 && Math.abs(b.x - paddle.x) <= paddle.w / 2 + b.r) {
          const hit = (b.x - paddle.x) / (paddle.w / 2);
          const sp = Math.min(Math.hypot(b.vx, b.vy) * 1.01, 900);
          const a = -Math.PI / 2 + hit * 1.05;
          b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
          b.y = paddle.y - b.r;
        }
        for (const br of bricks) {
          if (br.hp <= 0) continue;
          const nx = Math.max(br.x, Math.min(b.x, br.x + br.w));
          const ny = Math.max(br.y, Math.min(b.y, br.y + br.h));
          const dx = b.x - nx, dy = b.y - ny;
          if (dx * dx + dy * dy <= b.r * b.r) {
            if (Math.abs(dx) > Math.abs(dy)) b.vx = Math.sign(dx || -b.vx) * Math.abs(b.vx);
            else b.vy = Math.sign(dy || -b.vy) * Math.abs(b.vy);
            br.hp--;
            score += 10 * level;
            if (br.hp <= 0) {
              burst(br.x + br.w / 2, br.y + br.h / 2, br.color, 14);
              shake = 4;
              if (Math.random() < 0.12) drops.push({ x: br.x + br.w / 2, y: br.y, kind: Math.random() < 0.5 ? "wide" : "multi" });
            }
            break;
          }
        }
      }
    }
    balls = balls.filter((b) => b.y < H + 20);
    if (!balls.length) {
      lives--;
      shake = 10;
      if (lives <= 0) return gameOver();
      serve();
    }

    for (const d of drops) {
      d.y += 180 * dt;
      if (d.y > paddle.y - 8 && d.y < paddle.y + paddle.h && Math.abs(d.x - paddle.x) < paddle.w / 2 + 12) {
        d.taken = true;
        score += 50;
        if (d.kind === "wide") paddle.wideTimer = 12;
        else {
          const extra = [];
          for (const b of balls.slice(0, 3)) {
            for (const turn of [-0.4, 0.4]) {
              const sp = Math.hypot(b.vx, b.vy), a = Math.atan2(b.vy, b.vx) + turn;
              extra.push({ ...b, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp });
            }
          }
          balls.push(...extra);
        }
      }
    }
    drops = drops.filter((d) => !d.taken && d.y < H + 20);

    if (bricks.every((b) => b.hp <= 0)) {
      score += 500 * level;
      level++;
      if (window.Arcadia) Arcadia.submitScore(score);
      buildLevel();
    }
  }

  function gameOver() {
    state = "over";
    if (score > best()) localStorage.setItem("brickblitz.best", String(score));
    if (window.Arcadia) { Arcadia.submitScore(score); Arcadia.gameOver(); }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
  }

  function draw() {
    ctx.save();
    if (shake) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1b1340"); g.addColorStop(1, "#0d0a1f");
    ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, H + 40);

    for (const b of bricks) {
      if (b.hp <= 0) continue;
      ctx.fillStyle = b.color;
      ctx.globalAlpha = b.hp > 1 ? 1 : 0.85;
      roundRect(b.x, b.y, b.w, b.h, 5); ctx.fill();
      if (b.hp > 1) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.globalAlpha = 0.25; ctx.fillStyle = "#fff"; roundRect(b.x + 3, b.y + 3, b.w - 6, 5, 3); ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (const d of drops) {
      ctx.fillStyle = d.kind === "wide" ? "#3ddc97" : "#ffd23f";
      roundRect(d.x - 14, d.y - 9, 28, 18, 9); ctx.fill();
      ctx.fillStyle = "#111"; ctx.font = "bold 12px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(d.kind === "wide" ? "W" : "×3", d.x, d.y + 1);
    }
    ctx.shadowColor = "#4cc9f0"; ctx.shadowBlur = 16;
    ctx.fillStyle = "#4cc9f0"; roundRect(paddle.x - paddle.w / 2, paddle.y, paddle.w, paddle.h, 7); ctx.fill();
    ctx.shadowColor = "#fff";
    ctx.fillStyle = "#fff";
    for (const b of balls) { ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); }
    ctx.shadowBlur = 0;
    for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#fff"; ctx.font = "bold 18px system-ui"; ctx.textBaseline = "top";
    ctx.textAlign = "left"; ctx.fillText(`SCORE ${score ?? 0}`, 16, 16);
    ctx.textAlign = "center"; ctx.fillText(`LEVEL ${level ?? 1}`, W / 2, 16);
    ctx.textAlign = "right"; ctx.fillText("♥".repeat(Math.max(0, lives ?? 3)), W - 16, 16);
    ctx.restore();

    const center = (title, sub, sub2) => {
      ctx.fillStyle = "rgba(8,6,20,.72)"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = "900 64px system-ui"; ctx.fillText(title, W / 2, H / 2 - 50);
      ctx.font = "600 22px system-ui"; ctx.fillStyle = "#c9c3ff"; ctx.fillText(sub, W / 2, H / 2 + 20);
      if (sub2) { ctx.font = "16px system-ui"; ctx.fillStyle = "#8f88c9"; ctx.fillText(sub2, W / 2, H / 2 + 56); }
    };
    if (state === "title") center("BRICK BLITZ", "Tap or press Space to start", `Move: mouse, touch or ← →   ·   Best: ${best()}`);
    if (state === "serve") { ctx.fillStyle = "#c9c3ff"; ctx.font = "600 18px system-ui"; ctx.textAlign = "center"; ctx.fillText("Tap / Space to launch", W / 2, H - 90); }
    if (state === "over") center("GAME OVER", `Score ${score}   ·   Best ${best()}`, "Tap or press Space to play again");
  }

  if (!paddle) { reset(); state = "title"; }
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (!paused) update(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
