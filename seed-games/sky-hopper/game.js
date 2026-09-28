// Sky Hopper — an Arcadia seed game. Run, jump, double-jump, grab coins. Fork it and make it better!
(() => {
  const W = 800, H = 450;
  const c = document.getElementById("c");
  const ctx = c.getContext("2d");
  function fit() {
    const s = Math.min(innerWidth / W, innerHeight / H), d = window.devicePixelRatio || 1;
    c.style.width = W * s + "px"; c.style.height = H * s + "px";
    c.width = Math.round(W * s * d); c.height = Math.round(H * s * d);
    ctx.setTransform(s * d, 0, 0, s * d, 0, 0);
  }
  addEventListener("resize", fit); fit();

  const GRAV = 2200, JUMP = 760;
  const best = () => Number(localStorage.getItem("skyhopper.best") || 0);
  let state = "title", p, plats = [], coins = [], spikes = [], camX = 0, speed, dist, coinCount, t = 0, paused = false, sparkles = [];
  const clouds = Array.from({ length: 8 }, (_, i) => ({ x: i * 140 + Math.random() * 80, y: 30 + Math.random() * 140, s: 0.6 + Math.random() * 0.8 }));

  function reset() {
    p = { x: 120, y: 250, vy: 0, w: 30, h: 36, onGround: false, jumps: 0, squash: 0 };
    plats = [{ x: -50, y: 330, w: 600 }];
    coins = []; spikes = []; camX = 0; speed = 300; dist = 0; coinCount = 0; sparkles = [];
    while (plats[plats.length - 1].x < W * 2) addPlat();
    state = "play";
  }
  function addPlat() {
    const last = plats[plats.length - 1];
    const difficulty = Math.min(1, dist / 6000);
    const gap = 70 + Math.random() * (90 + difficulty * 110);
    const w = 120 + Math.random() * (260 - difficulty * 120);
    const y = Math.max(170, Math.min(380, last.y + (Math.random() - 0.5) * 150));
    const pl = { x: last.x + last.w + gap, y, w };
    plats.push(pl);
    const n = (Math.random() * 4) | 0;
    for (let i = 0; i < n; i++) coins.push({ x: pl.x + 30 + i * 34, y: pl.y - 50 - Math.sin(i / Math.max(1, n - 1) * Math.PI) * 30, got: false });
    if (dist > 1500 && Math.random() < 0.3 + difficulty * 0.3 && w > 170) spikes.push({ x: pl.x + w / 2 - 15 + (Math.random() - 0.5) * (w - 90), y: pl.y, w: 30 });
  }

  function jump() {
    if (state !== "play") { reset(); return; }
    if (p.onGround || p.jumps < 2) {
      p.vy = -JUMP * (p.jumps === 1 ? 0.88 : 1);
      p.jumps++; p.onGround = false; p.squash = -0.25;
    }
  }
  addEventListener("keydown", (e) => { if ([" ", "ArrowUp", "w", "Enter"].includes(e.key)) { if (!e.repeat) jump(); e.preventDefault(); } });
  c.addEventListener("pointerdown", () => { jump(); c.focus(); });
  if (window.Arcadia) { Arcadia.onPause(() => (paused = true)); Arcadia.onResume(() => (paused = false)); }

  function die() {
    state = "over";
    const s = score();
    if (s > best()) localStorage.setItem("skyhopper.best", String(s));
    if (window.Arcadia) { Arcadia.submitScore(s); Arcadia.gameOver(); }
  }
  const score = () => Math.floor(dist / 10) + coinCount * 25;

  function update(dt) {
    t += dt;
    for (const s of sparkles) { s.life -= dt; s.y -= 40 * dt; }
    sparkles = sparkles.filter((s) => s.life > 0);
    if (state !== "play") return;
    speed = Math.min(620, 300 + dist / 25);
    const dx = speed * dt;
    dist += dx; camX += dx; p.x += dx;
    const prevBottom = p.y + p.h;
    p.vy += GRAV * dt; p.y += p.vy * dt;
    p.onGround = false;
    for (const pl of plats) {
      if (p.x + p.w > pl.x && p.x < pl.x + pl.w && p.vy >= 0 && prevBottom <= pl.y + 2 && p.y + p.h >= pl.y) {
        p.y = pl.y - p.h; p.vy = 0; p.onGround = true;
        if (p.jumps) p.squash = 0.25;
        p.jumps = 0;
      }
    }
    p.squash *= Math.pow(0.001, dt);
    for (const co of coins) {
      if (!co.got && Math.abs(co.x - (p.x + p.w / 2)) < 26 && Math.abs(co.y - (p.y + p.h / 2)) < 30) {
        co.got = true; coinCount++;
        sparkles.push({ x: co.x, y: co.y, life: 0.6, text: "+25" });
      }
    }
    for (const s of spikes) {
      if (p.x + p.w - 6 > s.x && p.x + 6 < s.x + s.w && p.y + p.h > s.y - 18) return die();
    }
    if (p.y > H + 60) return die();
    while (plats[plats.length - 1].x < camX + W * 2) addPlat();
    plats = plats.filter((pl) => pl.x + pl.w > camX - 100);
    coins = coins.filter((co) => co.x > camX - 100);
    spikes = spikes.filter((s) => s.x > camX - 100);
  }

  function draw() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#5ab0ff"); sky.addColorStop(1, "#c9ecff");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,.9)";
    for (const cl of clouds) {
      const x = ((cl.x - camX * 0.15 * cl.s) % (W + 200) + W + 200) % (W + 200) - 100;
      ctx.beginPath();
      ctx.ellipse(x, cl.y, 50 * cl.s, 18 * cl.s, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 30 * cl.s, cl.y - 12 * cl.s, 34 * cl.s, 20 * cl.s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#8fd18b";
    for (let i = -1; i < 6; i++) {
      const x = i * 220 - ((camX * 0.35) % 220);
      ctx.beginPath(); ctx.ellipse(x, H + 30, 160, 120, 0, 0, Math.PI * 2); ctx.fill();
    }

    ctx.save(); ctx.translate(-camX, 0);
    for (const pl of plats) {
      ctx.fillStyle = "#7a4e2d"; ctx.fillRect(pl.x, pl.y + 12, pl.w, H - pl.y);
      ctx.fillStyle = "#4caf50"; ctx.beginPath(); ctx.roundRect(pl.x - 4, pl.y, pl.w + 8, 16, 6); ctx.fill();
      ctx.fillStyle = "#6fd46f"; ctx.fillRect(pl.x, pl.y + 2, pl.w, 4);
    }
    for (const s of spikes) {
      ctx.fillStyle = "#5b6475";
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(s.x + i * 10, s.y); ctx.lineTo(s.x + i * 10 + 5, s.y - 18); ctx.lineTo(s.x + i * 10 + 10, s.y); ctx.fill(); }
    }
    for (const co of coins) {
      if (co.got) continue;
      const wob = Math.abs(Math.cos(t * 4 + co.x));
      ctx.fillStyle = "#ffcf33"; ctx.strokeStyle = "#e0a100"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(co.x, co.y, 10 * wob + 2, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    if (p) {
      const sq = p.squash;
      const w = p.w * (1 + sq), h = p.h * (1 - sq);
      const x = p.x + (p.w - w) / 2, y = p.y + (p.h - h);
      ctx.fillStyle = "#ff5a5f"; ctx.beginPath(); ctx.roundRect(x, y, w, h, 9); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x + w - 9, y + 12, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(x + w - 7, y + 12, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffb3b5"; ctx.fillRect(x + 4, y + h - 8, w - 8, 4);
    }
    ctx.font = "800 16px system-ui"; ctx.textAlign = "center";
    for (const s of sparkles) { ctx.globalAlpha = s.life / 0.6; ctx.fillStyle = "#b8860b"; ctx.fillText(s.text, s.x, s.y - 20); }
    ctx.globalAlpha = 1;
    ctx.restore();

    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.roundRect(12, 12, 250, 40, 12); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.font = "800 20px system-ui";
    ctx.fillText(`${state === "title" ? 0 : score()}   ●  ${coinCount || 0}`, 26, 32);
    ctx.textAlign = "right"; ctx.font = "700 16px system-ui"; ctx.fillStyle = "#0b3b66"; ctx.fillText(`Best ${best()}`, W - 16, 30);

    if (state !== "play") {
      ctx.fillStyle = "rgba(10,40,80,.55)"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff"; ctx.textAlign = "center";
      ctx.font = "900 60px system-ui"; ctx.fillText(state === "over" ? "Ouch!" : "SKY HOPPER", W / 2, H / 2 - 40);
      ctx.font = "600 20px system-ui";
      ctx.fillText(state === "over" ? `Score ${score()}  ·  Best ${best()}` : "Tap / Space to jump. Tap again in the air to double-jump.", W / 2, H / 2 + 20);
      ctx.fillText("Tap or press Space to " + (state === "over" ? "try again" : "start"), W / 2, H / 2 + 56);
    }
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000); last = now;
    if (!paused) update(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
