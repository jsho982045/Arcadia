// Shared "first-person" board view: tilts the canvas toward the player (CSS perspective) and maps
// pointer input back through the inverse projection, so game code keeps using flat canvas coordinates.
(() => {
  const c = document.getElementById("c");
  if (!c) return;
  const TILT = 24; // degrees
  function apply() {
    const h = c.offsetHeight || 800;
    c.style.transformOrigin = "50% 100%";
    c.style.transform = "perspective(" + Math.round(h * 1.3) + "px) rotateX(" + TILT + "deg)";
    c.style.willChange = "transform";
  }
  apply();
  if (window.ResizeObserver) new ResizeObserver(apply).observe(c);
  addEventListener("resize", apply);
  function toLocal(sx, sy) {
    const w = c.offsetWidth, h = c.offsetHeight;
    const m = new DOMMatrix(getComputedStyle(c).transform);
    const dx = sx - (c.offsetLeft + w / 2), dy = sy - (c.offsetTop + h);
    const a = m.m11 - dx * m.m14, b = m.m21 - dx * m.m24, e = dx * m.m44 - m.m41;
    const d = m.m12 - dy * m.m14, f = m.m22 - dy * m.m24, g = dy * m.m44 - m.m42;
    const det = a * f - b * d;
    if (!det) return null;
    return { x: (e * f - b * g) / det + w / 2, y: (a * g - e * d) / det + h, w, h };
  }
  let busy = false;
  ["pointerdown", "pointermove", "pointerup"].forEach((type) => {
    addEventListener(type, (e) => {
      if (busy || e.target !== c || !e.isTrusted) return;
      const p = toLocal(e.clientX, e.clientY);
      if (!p) return;
      e.stopImmediatePropagation();
      const r = c.getBoundingClientRect();
      const ev = new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: e.pointerId, pointerType: e.pointerType, isPrimary: e.isPrimary,
        button: e.button, buttons: e.buttons, clientX: r.left + (p.x / p.w) * r.width, clientY: r.top + (p.y / p.h) * r.height,
      });
      busy = true;
      try { c.dispatchEvent(ev); } finally { busy = false; }
    }, true);
  });
})();
