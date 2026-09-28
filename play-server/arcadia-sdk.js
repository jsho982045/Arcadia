/*
 * Arcadia Game SDK — injected automatically into every game page.
 *
 *   Arcadia.submitScore(1234)          post a score to the game's leaderboard
 *   Arcadia.save({ level: 3 })         save progress for the signed-in player (cloud save)
 *   Arcadia.load()                     -> the last saved object (or null), available instantly
 *   Arcadia.onPause(fn) / onResume(fn) the site paused/resumed the game (e.g. tab hidden)
 *   Arcadia.gameOver()                 optional: tells the site a round ended
 *
 * Games run in a sandbox with no access to real localStorage, so the SDK provides a drop-in
 * localStorage that is saved to the player's Arcadia account. Existing games "just work".
 */
(function () {
  "use strict";
  var PARENT = typeof __ARCADIA_PARENT_ORIGIN === "string" ? __ARCADIA_PARENT_ORIGIN : "*";
  var boot = { save: null };
  try {
    var parsed = JSON.parse(window.name || "{}");
    if (parsed && parsed.arcadia) boot = parsed.arcadia;
  } catch (e) {}
  try { window.name = ""; } catch (e) {}

  var state = boot.save && typeof boot.save === "object" ? boot.save : {};
  var ls = state.ls && typeof state.ls === "object" ? state.ls : {};
  var custom = state.custom === undefined ? null : state.custom;

  function post(type, payload) {
    try {
      window.parent.postMessage({ __arcadia: 1, type: type, payload: payload === undefined ? null : payload }, PARENT);
    } catch (e) {}
  }

  var saveTimer = null;
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      post("save", { ls: ls, custom: custom });
    }, 800);
  }

  // ---- localStorage shim (sandboxed frames can't use the real one) ----
  var needsShim = false;
  try {
    window.localStorage.getItem("__probe");
  } catch (e) {
    needsShim = true;
  }
  if (needsShim) {
    var store = {
      getItem: function (k) { k = String(k); return Object.prototype.hasOwnProperty.call(ls, k) ? ls[k] : null; },
      setItem: function (k, v) { ls[String(k)] = String(v); scheduleSave(); },
      removeItem: function (k) { delete ls[String(k)]; scheduleSave(); },
      clear: function () { ls = {}; scheduleSave(); },
      key: function (i) { return Object.keys(ls)[i] || null; },
    };
    Object.defineProperty(store, "length", { get: function () { return Object.keys(ls).length; } });
    try {
      Object.defineProperty(window, "localStorage", { configurable: true, get: function () { return store; } });
    } catch (e) {}
    try {
      var memSession = {};
      Object.defineProperty(window, "sessionStorage", {
        configurable: true,
        get: function () {
          return {
            getItem: function (k) { return memSession[k] === undefined ? null : memSession[k]; },
            setItem: function (k, v) { memSession[k] = String(v); },
            removeItem: function (k) { delete memSession[k]; },
            clear: function () { memSession = {}; },
          };
        },
      });
    } catch (e) {}
  }

  // ---- Activity tracking: only active play counts toward play time (and creator earnings) ----
  var lastPing = 0;
  function activity() {
    var now = Date.now();
    if (now - lastPing > 3000) {
      lastPing = now;
      post("activity");
    }
  }
  ["keydown", "pointerdown", "pointermove", "touchstart", "wheel", "mousedown"].forEach(function (ev) {
    window.addEventListener(ev, activity, { passive: true, capture: true });
  });
  setInterval(function () {
    try {
      var pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (var i = 0; i < pads.length; i++) {
        var p = pads[i];
        if (p && p.buttons.some(function (b) { return b.pressed; })) { activity(); break; }
      }
    } catch (e) {}
  }, 2000);

  var pauseFns = [], resumeFns = [];
  window.addEventListener("message", function (e) {
    if (e.source !== window.parent) return;
    var d = e.data;
    if (!d || d.__arcadia !== 1) return;
    if (d.type === "pause") pauseFns.forEach(function (f) { try { f(); } catch (x) {} });
    if (d.type === "resume") resumeFns.forEach(function (f) { try { f(); } catch (x) {} });
  });

  window.Arcadia = {
    version: 1,
    submitScore: function (score) {
      var n = Math.floor(Number(score));
      if (isFinite(n) && n >= 0) post("score", { score: n });
    },
    save: function (data) { custom = data === undefined ? null : data; scheduleSave(); },
    load: function () { return custom; },
    onPause: function (fn) { if (typeof fn === "function") pauseFns.push(fn); },
    onResume: function (fn) { if (typeof fn === "function") resumeFns.push(fn); },
    gameOver: function () { post("gameover"); },
    isSignedIn: !!boot.signedIn,
  };

  window.addEventListener("load", function () { post("loaded"); });
  window.addEventListener("error", function (e) { post("error", { message: String(e.message || "error").slice(0, 300) }); });
})();
