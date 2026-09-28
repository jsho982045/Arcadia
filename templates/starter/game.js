// Starter game: catch the falling stars.
// The Arcadia SDK is loaded for you:
//   Arcadia.submitScore(n)   add a score to the leaderboard
//   Arcadia.save(obj) / Arcadia.load()   cloud saves (localStorage also works)
const c = document.getElementById("c");
const ctx = c.getContext("2d");
const W = c.width, H = c.height;

function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  c.style.width = W * s + "px";
  c.style.height = H * s + "px";
}
addEventListener("resize", fit);
fit();

let player = { x: W / 2, w: 90 };
let stars = [];
let score = 0, lives = 3, playing = false, spawn = 0;

addEventListener("pointermove", (e) => {
  const r = c.getBoundingClientRect();
  player.x = ((e.clientX - r.left) / r.width) * W;
});
addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") player.x -= 30;
  if (e.key === "ArrowRight") player.x += 30;
  if (e.key === " " && !playing) start();
});
c.addEventListener("pointerdown", () => { if (!playing) start(); });

function start() { score = 0; lives = 3; stars = []; playing = true; }

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (playing) {
    spawn -= dt;
    if (spawn <= 0) { stars.push({ x: 20 + Math.random() * (W - 40), y: -10, v: 150 + score * 3 }); spawn = 0.7; }
    for (const s of stars) {
      s.y += s.v * dt;
      if (s.y > H - 40 && s.y < H - 20 && Math.abs(s.x - player.x) < player.w / 2) { s.caught = true; score++; }
      if (s.y > H) { s.missed = true; lives--; }
    }
    stars = stars.filter((s) => !s.caught && !s.missed);
    if (lives <= 0) { playing = false; Arcadia.submitScore(score); }
  }
  ctx.fillStyle = "#111827"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fde047";
  for (const s of stars) { ctx.beginPath(); ctx.arc(s.x, s.y, 10, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = "#60a5fa"; ctx.fillRect(player.x - player.w / 2, H - 30, player.w, 12);
  ctx.fillStyle = "#fff"; ctx.font = "20px system-ui"; ctx.fillText(`Score ${score}   Lives ${lives}`, 16, 30);
  if (!playing) { ctx.textAlign = "center"; ctx.fillText("Click or press Space to start", W / 2, H / 2); ctx.textAlign = "left"; }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
