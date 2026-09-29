// Orbit Survivors - WebAudio synthesised SFX + ambient pulse (no assets).
window.SFX = (() => {
  let ac = null, master, sb, mb, nbuf, muted = false, lastT = {}, nextBeat = 0, beat = 0;
  function init() {
    if (ac) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ac = new AC();
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
      master = ac.createGain(); master.gain.value = muted ? 0 : 0.85;
      master.connect(comp); comp.connect(ac.destination);
      sb = ac.createGain(); sb.gain.value = 0.75; sb.connect(master);
      mb = ac.createGain(); mb.gain.value = 0.55; mb.connect(master);
      nbuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = nbuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // soft drone pad
      const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 240;
      const dg = ac.createGain(); dg.gain.value = 0.05; lp.connect(dg); dg.connect(mb);
      [[55, "sawtooth"], [55.35, "sawtooth"], [110.2, "sine"]].forEach((p) => {
        const o = ac.createOscillator(); o.type = p[1]; o.frequency.value = p[0]; o.connect(lp); o.start();
      });
      return true;
    } catch (e) { ac = null; return false; }
  }
  function resume() { if (ac && ac.state !== "running") { try { ac.resume(); } catch (e) {} } }
  function suspend() { if (ac && ac.state === "running") { try { ac.suspend(); } catch (e) {} } }
  function ok(name, gap) {
    if (!ac || muted || ac.state !== "running") return false;
    const t = ac.currentTime;
    if (t - (lastT[name] || -9) < gap) return false;
    lastT[name] = t; return true;
  }
  function tone(type, f0, f1, dur, vol, t0, bus) {
    const t = t0 || ac.currentTime;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || sb); o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(dur, vol, f0, f1, type, t0, bus) {
    const t = t0 || ac.currentTime;
    const s = ac.createBufferSource(); s.buffer = nbuf; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = type || "bandpass";
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    f.Q.value = 1.2;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(sb); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
  }
  const F = {
    hit(a) { if (ok("hit", 0.04)) tone("square", 260 + (a || 0) * 30, 120, 0.05, 0.05); },
    crit() { if (ok("crit", 0.05)) { tone("square", 520, 180, 0.09, 0.08); noise(0.05, 0.1, 3000, 1500, "highpass"); } },
    kill(a) { if (ok("kill", 0.03)) { tone("triangle", 420 * (1 + (a || 0) * 0.05), 90, 0.13, 0.13); noise(0.09, 0.09, 1800, 400); } },
    bigkill() { if (ok("bigkill", 0.1)) { tone("sawtooth", 200, 40, 0.35, 0.2); noise(0.3, 0.2, 1200, 120); } },
    gem(combo) { if (ok("gem", 0.03)) tone("sine", 620 + Math.min(combo, 14) * 46, 900 + Math.min(combo, 14) * 60, 0.09, 0.09); },
    heart() { tone("sine", 500, 1000, 0.25, 0.14); tone("sine", 750, 1500, 0.25, 0.1, ac && ac.currentTime + 0.08); },
    hurt() { if (ok("hurt", 0.12)) { tone("sawtooth", 170, 45, 0.3, 0.25); noise(0.2, 0.2, 900, 150); } },
    levelup() { if (!ac || muted) return; [523, 659, 784, 1047].forEach((f, i) => tone("triangle", f, f, 0.22, 0.14, ac.currentTime + i * 0.07)); },
    pick() { if (!ac || muted) return; tone("sine", 660, 1320, 0.18, 0.15); tone("triangle", 990, 1980, 0.22, 0.09, ac.currentTime + 0.05); },
    evo() { if (!ac || muted) return; [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone("sawtooth", f, f * 1.01, 0.3, 0.09, ac.currentTime + i * 0.06)); noise(0.6, 0.12, 400, 4000, "bandpass"); },
    shoot() { if (ok("shoot", 0.05)) tone("square", 900, 320, 0.07, 0.04); },
    zap() { if (ok("zap", 0.06)) { noise(0.12, 0.12, 4200, 600); tone("sawtooth", 1400, 200, 0.1, 0.05); } },
    dash() { if (ok("dash", 0.1)) { noise(0.25, 0.16, 400, 5000, "bandpass"); tone("sine", 300, 900, 0.18, 0.08); } },
    shieldUp() { if (ok("shup", 0.2)) tone("sine", 400, 1200, 0.3, 0.1); },
    shieldPop() { if (ok("shpop", 0.1)) { tone("square", 900, 90, 0.3, 0.2); noise(0.25, 0.2, 3000, 300); } },
    reflect() { if (ok("refl", 0.05)) tone("triangle", 1400, 2200, 0.08, 0.08); },
    boom() { if (ok("boom", 0.05)) { noise(0.2, 0.15, 900, 120); tone("sine", 120, 40, 0.2, 0.15); } },
    warn() { if (!ac || muted) return; for (let i = 0; i < 4; i++) { tone("sawtooth", 440, 440, 0.2, 0.12, ac.currentTime + i * 0.42); tone("sawtooth", 330, 330, 0.2, 0.12, ac.currentTime + i * 0.42 + 0.21); } },
    bossHit() { if (ok("bhit", 0.06)) tone("square", 140, 80, 0.06, 0.07); },
    bossDie() { if (!ac || muted) return; noise(1.2, 0.3, 2000, 80); tone("sawtooth", 300, 30, 1.0, 0.25); [523, 659, 784, 1047, 1319].forEach((f, i) => tone("triangle", f, f, 0.4, 0.13, ac.currentTime + 0.5 + i * 0.09)); },
    telegraph() { if (ok("tele", 0.2)) tone("sine", 200, 600, 0.3, 0.08); },
    bossShot() { if (ok("bshot", 0.08)) tone("square", 300, 150, 0.1, 0.05); },
    over() { if (!ac || muted) return; [400, 330, 262, 196].forEach((f, i) => tone("sawtooth", f, f * 0.9, 0.45, 0.14, ac.currentTime + i * 0.2)); },
    click() { if (!ac || muted) return; tone("sine", 800, 1100, 0.07, 0.1); },
    buy() { if (!ac || muted) return; [660, 880, 1320].forEach((f, i) => tone("triangle", f, f, 0.15, 0.12, ac.currentTime + i * 0.06)); },
    deny() { if (!ac || muted) return; tone("square", 150, 110, 0.15, 0.08); },
    wave() { if (!ac || muted) return; tone("sawtooth", 110, 220, 0.5, 0.12); noise(0.4, 0.08, 200, 2000); },
    revive() { if (!ac || muted) return; [262, 392, 523, 784].forEach((f, i) => tone("sine", f, f, 0.4, 0.15, ac.currentTime + i * 0.08)); },
  };
  function play(n, a) { if (!ac || muted) return; try { if (F[n]) F[n](a); } catch (e) {} }
  // ambient pulse: quarter-note kick + sub bass + sparse pings. intensity 0..1
  const NOTES = [55, 55, 65.4, 49, 55, 73.4, 65.4, 49];
  const PENT = [220, 261.6, 293.7, 349.2, 392, 440, 523.3];
  function tick(active, intensity) {
    if (!ac || muted || !active || ac.state !== "running") return;
    const t = ac.currentTime;
    if (nextBeat < t - 0.4) nextBeat = t + 0.05;
    const period = 60 / (86 + intensity * 44);
    while (nextBeat < t + 0.14) {
      const s = beat & 15, w = nextBeat;
      tone("sine", 120, 42, 0.22, 0.42 + intensity * 0.1, w, mb);
      if ((s & 1) === 0) tone("sawtooth", NOTES[(s >> 1) & 7], NOTES[(s >> 1) & 7], period * 1.7, 0.10, w, mb);
      if ((s & 3) === 3 || (intensity > 0.5 && (s & 1))) tone("sine", PENT[(beat * 5 + (beat >> 2)) % 7] * (s & 4 ? 2 : 1), PENT[(beat * 5 + (beat >> 2)) % 7] * (s & 4 ? 2 : 1), 0.5, 0.035 + intensity * 0.03, w + period * 0.5, mb);
      if (intensity > 0.3 && (s & 1)) { const st = w + period * 0.5; const src = ac.createBufferSource(); src.buffer = nbuf; const f = ac.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 7000; const g = ac.createGain(); g.gain.setValueAtTime(0.06, st); g.gain.exponentialRampToValueAtTime(0.0001, st + 0.05); src.connect(f); f.connect(g); g.connect(mb); src.start(st, Math.random() * 0.5); src.stop(st + 0.07); }
      nextBeat += period; beat++;
    }
  }
  function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.85; }
  return { init, resume, suspend, play, tick, setMuted, get muted() { return muted; }, get ready() { return !!ac; } };
})();
