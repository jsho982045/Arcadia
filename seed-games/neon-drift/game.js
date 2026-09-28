// Neon Drift — an Arcadia seed game. Weave through traffic at night. Fork it and make it better!
(() => {
  const W = 480, H = 760, ROAD_X = 60, ROAD_W = 360, LANES = 4, LANE_W = ROAD_W / LANES;
  const c = document.getElementById("c");
  const ctx = c.getContext("2d");
  function fit() {
    const s = Math.min(innerWidth / W, innerHeight / H), d = window.devicePixelRatio || 1;
    c.style.width = W * s + "px"; c.style.height = H * s + "px";
    c.width = Math.round(W * s * d); c.height = Math.round(H * s * d);
    ctx.setTransform(s * d, 0, 0, s * d, 0, 0);
  }
  addEventListener("resize", fit); fit();

  const CAR_COLORS = ["#ff4d6d", "#ffd23f", "#3ddc97", "#9d4edd", "#ff9f1c", "#f8f8f8"];
  const best = () => Number(localStorage.getItem("neondrift.best") || 0);
  let state = "title", car, traffic = [], orbs = [], speed = 0, dist = 0, bonus = 0, roadOff = 0, spawnT = 0, t = 0, popups = [], paused = false, crashT = 0;
  const keys = {};
  let steerTarget = null;

  function reset() {
    car = { x: W / 2, y: H - 150, w: 44, h: 80, tilt: 0 };
    traffic = []; orbs = []; speed = 420; dist = 0; bonus = 0; spawnT = 0; popups = []; crashT = 0;
    state = "play";
  }
  const laneX = (i) => ROAD_X + LANE_W * i + LANE_W / 2;

  function spawn() {
    const difficulty = Math.min(1, dist / 40000);
    const lane = (Math.random() * LANES) | 0;
    if (traffic.some((o) => o.y < 60 && Math.abs(o.x - laneX(lane)) < 10)) return;
    traffic.push({ x: laneX(lane), y: -100, w: 44, h: 80, v: 120 + Math.random() * 120, color: CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0], passed: false });
    if (Math.random() < 0.35 + difficulty * 0.3) {
      const lane2 = (lane + 1 + ((Math.random() * (LANES - 1)) | 0)) % LANES;
      traffic.push({ x: laneX(lane2), y: -260, w: 44, h: 80, v: 150, color: CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0], passed: false });
    }
    if (Math.random() < 0.3) orbs.push({ x: laneX((Math.random() * LANES) | 0), y: -40 });
  }

  addEventListener("keydown", (e) => {
    keys[e.key] = true;
    if (["ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
    if ((e.key === " " || e.key === "Enter") && state !== "play") reset();
  });
  addEventListener("keyup", (e) => (keys[e.key] = false));
  function localX(e) { const r = c.getBoundingClientRect(); return ((e.clientX - r.left) / r.width) * W; }
  c.addEventListener("pointerdown", (e) => { if (state !== "play" && crashT <= 0) { reset(); return; } steerTarget = localX(e); c.focus(); });
  addEventListener("pointermove", (e) => { if (e.buttons || e.pointerType === "touch") steerTarget = localX(e); });
  addEventListener("pointerup", () => (steerTarget = null));
  if (window.Arcadia) { Arcadia.onPause(() => (paused = true)); Arcadia.onResume(() => (paused = false)); }

  const score = () => Math.floor(dist / 20) + bonus;

  function crash() {
    state = "over"; crashT = 0.8;
    const s = score();
    if (s > best()) localStorage.setItem("neondrift.best", String(s));
    if (window.Arcadia) { Arcadia.submitScore(s); Arcadia.gameOver(); }
  }

  function update(dt) {
    t += dt; crashT = Math.max(0, crashT - dt);
    for (const p of popups) { p.life -= dt; p.y -= 60 * dt; }
    popups = popups.filter((p) => p.life > 0);
    if (state !== "play") { roadOff = (roadOff + 60 * dt) % 80; return; }
    speed = Math.min(1100, 420 + dist / 60);
    dist += speed * dt;
    roadOff = (roadOff + speed * dt) % 80;

    let steer = 0;
    if (keys.ArrowLeft || keys.a) steer -= 1;
    if (keys.ArrowRight || keys.d) steer += 1;
    const before = car.x;
    if (steerTarget !== null && !steer) car.x += (steerTarget - car.x) * Math.min(1, dt * 10);
    else car.x += steer * 460 * dt;
    car.x = Math.max(ROAD_X + car.w / 2 + 4, Math.min(ROAD_X + ROAD_W - car.w / 2 - 4, car.x));
    car.tilt += (((car.x - before) / Math.max(dt, 0.001)) / 1600 - car.tilt) * Math.min(1, dt * 12);

    spawnT -= dt;
    if (spawnT <= 0) { spawn(); spawnT = Math.max(0.32, 0.9 - dist / 60000) * (420 / speed) * 1.4; }
    for (const o of traffic) {
      o.y += (speed - o.v) * dt;
      if (Math.abs(o.x - car.x) < (o.w + car.w) / 2 - 8 && Math.abs(o.y - car.y) < (o.h + car.h) / 2 - 10) return crash();
      if (!o.passed && o.y > car.y + car.h / 2) {
        o.passed = true;
        if (Math.abs(o.x - car.x) < LANE_W * 1.05) { bonus += 15; popups.push({ x: car.x, y: car.y - 60, life: 0.7, text: "NEAR MISS +15" }); }
      }
    }
    for (const o of orbs) {
      o.y += speed * dt;
      if (!o.got && Math.abs(o.x - car.x) < 34 && Math.abs(o.y - car.y) < 50) { o.got = true; bonus += 50; popups.push({ x: o.x, y: o.y - 30, life: 0.7, text: "+50" }); }
    }
    traffic = traffic.filter((o) => o.y < H + 120);
    orbs = orbs.filter((o) => !o.got && o.y < H + 40);
  }

  function drawCar(x, y, color, tilt = 0, player = false) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
    ctx.shadowColor = color; ctx.shadowBlur = player ? 24 : 12;
    ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(-22, -40, 44, 80, 12); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(10,10,30,.85)"; ctx.beginPath(); ctx.roundRect(-16, player ? -22 : -8, 32, 26, 6); ctx.fill();
    ctx.fillStyle = player ? "#fffbe0" : "#ff2d55";
    if (player) { ctx.fillRect(-18, -40, 10, 5); ctx.fillRect(8, -40, 10, 5); }
    else { ctx.fillRect(-18, 35, 10, 5); ctx.fillRect(8, 35, 10, 5); }
    ctx.restore();
  }

  function draw() {
    ctx.fillStyle = "#07060f"; ctx.fillRect(0, 0, W, H);
    // city lights at the roadside
    for (let i = 0; i < 12; i++) {
      const y = ((i * 90 + roadOff * 1.2) % (H + 90)) - 45;
      ctx.fillStyle = i % 2 ? "#2d1b69" : "#1b2a69";
      ctx.fillRect(4, y, 40, 70); ctx.fillRect(W - 44, y + 30, 40, 70);
      ctx.fillStyle = "#ffd23f55"; ctx.fillRect(12, y + 10, 6, 6); ctx.fillRect(W - 30, y + 44, 6, 6);
    }
    ctx.fillStyle = "#15131f"; ctx.fillRect(ROAD_X, 0, ROAD_W, H);
    ctx.strokeStyle = "#ff3df0"; ctx.lineWidth = 4; ctx.shadowColor = "#ff3df0"; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.moveTo(ROAD_X, 0); ctx.lineTo(ROAD_X, H); ctx.moveTo(ROAD_X + ROAD_W, 0); ctx.lineTo(ROAD_X + ROAD_W, H); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,.35)";
    for (let l = 1; l < LANES; l++) for (let y = -80 + roadOff; y < H; y += 80) ctx.fillRect(ROAD_X + l * LANE_W - 2, y, 4, 40);

    for (const o of orbs) {
      ctx.shadowColor = "#2ef2ff"; ctx.shadowBlur = 20; ctx.fillStyle = "#2ef2ff";
      ctx.beginPath(); ctx.arc(o.x, o.y, 10 + Math.sin(t * 8) * 2, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    }
    for (const o of traffic) drawCar(o.x, o.y, o.color);
    if (car) drawCar(car.x, car.y, "#2ef2ff", car.tilt, true);
    ctx.font = "900 18px system-ui"; ctx.textAlign = "center";
    for (const p of popups) { ctx.globalAlpha = p.life / 0.7; ctx.fillStyle = "#ffd23f"; ctx.fillText(p.text, p.x, p.y); }
    ctx.globalAlpha = 1;

    ctx.fillStyle = "rgba(7,6,15,.7)"; ctx.fillRect(0, 0, W, 54);
    ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.font = "900 22px system-ui";
    ctx.textAlign = "left"; ctx.fillText(state === "title" ? "0" : String(score()), 16, 28);
    ctx.textAlign = "center"; ctx.fillStyle = "#2ef2ff"; ctx.fillText(`${Math.round(speed / 6)} km/h`, W / 2, 28);
    ctx.textAlign = "right"; ctx.fillStyle = "#c9c3ff"; ctx.font = "700 16px system-ui"; ctx.fillText(`Best ${best()}`, W - 16, 28);

    if (state !== "play") {
      ctx.fillStyle = "rgba(7,6,15,.72)"; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.font = "900 54px system-ui";
      ctx.fillText(state === "over" ? "CRASHED" : "NEON DRIFT", W / 2, H / 2 - 60);
      ctx.font = "600 18px system-ui"; ctx.fillStyle = "#c9c3ff";
      if (state === "over") ctx.fillText(`Score ${score()}  ·  Best ${best()}`, W / 2, H / 2);
      else { ctx.fillText("Dodge traffic. Near misses and blue orbs score bonus.", W / 2, H / 2); }
      ctx.fillText("← → / A D, or drag to steer", W / 2, H / 2 + 34);
      ctx.fillStyle = "#fff"; ctx.fillText("Tap or press Space to " + (state === "over" ? "race again" : "start"), W / 2, H / 2 + 80);
    }
  }

  let last = performance.now();
  function loop(now) { const dt = Math.min(0.033, (now - last) / 1000); last = now; if (!paused) update(dt); draw(); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
})();
