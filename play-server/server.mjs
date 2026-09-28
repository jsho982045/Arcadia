// Arcadia play server.
//
// Serves game files from a SEPARATE ORIGIN to the main site (in production: its own registered
// domain, e.g. arcadia-play.net). Combined with the sandboxed <iframe> on the site and the strict
// Content-Security-Policy below, uploaded game code can't read site cookies, call the site's API
// as the player, or talk to the outside internet.
//
// Routes:
//   GET /v/<versionId>/<path>   a file from an immutable game version
//   GET /sdk/arcadia-sdk.js     the game SDK (auto-injected into every HTML page)
//   GET /health
//
// No dependencies; run with `node play-server/server.mjs`.

import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
for (const f of [".env.local", ".env"]) {
  try {
    if (fs.existsSync(f)) process.loadEnvFile(f);
  } catch {}
}

const PORT = Number(process.env.PLAY_PORT || 3001);
const STORAGE = path.resolve(process.env.STORAGE_DIR || ".data/storage");
const APP_ORIGIN = process.env.APP_ORIGIN || "http://localhost:3002";
const SDK = `var __ARCADIA_PARENT_ORIGIN = ${JSON.stringify(APP_ORIGIN)};\n` + fs.readFileSync(path.join(here, "arcadia-sdk.js"), "utf8");

const MIME = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", json: "application/json; charset=utf-8",
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  ico: "image/x-icon", avif: "image/avif", mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", m4a: "audio/mp4",
  mp4: "video/mp4", webm: "video/webm", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
  wasm: "application/wasm", txt: "text/plain; charset=utf-8", md: "text/plain; charset=utf-8", xml: "application/xml",
  glsl: "text/plain; charset=utf-8", data: "application/octet-stream", pck: "application/octet-stream",
  bin: "application/octet-stream", gltf: "model/gltf+json", glb: "model/gltf-binary", csv: "text/csv",
};

// Games may only load things from this server. No outbound network, no forms, no navigation away.
const CSP = [
  "default-src 'self' data: blob:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "form-action 'none'",
  "base-uri 'none'",
  `frame-ancestors ${APP_ORIGIN}`,
].join("; ");

const treeCache = new Map();
async function loadTree(versionId) {
  if (treeCache.has(versionId)) return treeCache.get(versionId);
  try {
    const tree = JSON.parse(await fsp.readFile(path.join(STORAGE, "trees", `${versionId}.json`), "utf8"));
    if (treeCache.size > 500) treeCache.delete(treeCache.keys().next().value);
    treeCache.set(versionId, tree); // versions are immutable, so caching forever is safe
    return tree;
  } catch {
    return null;
  }
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "X-Content-Type-Options": "nosniff", ...headers });
  res.end(body);
}

function injectSdk(html) {
  const tag = '<script src="/sdk/arcadia-sdk.js"></script>';
  const s = html.toString("utf8");
  const m = s.match(/<head[^>]*>/i);
  if (m) return s.replace(m[0], m[0] + tag);
  return tag + s;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
    if (url.pathname === "/health") return send(res, 200, "ok");
    if (url.pathname === "/sdk/arcadia-sdk.js") {
      return send(res, 200, SDK, { "Content-Type": MIME.js, "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" });
    }
    const m = url.pathname.match(/^\/v\/([a-z0-9]{16})\/(.*)$/);
    if (!m) return send(res, 404, "Not found");
    const [, versionId, rawPath] = m;
    const tree = await loadTree(versionId);
    if (!tree) return send(res, 404, "Unknown version");
    let filePath = decodeURIComponent(rawPath || "index.html");
    if (filePath === "" || filePath.endsWith("/")) filePath += "index.html";
    const entry = tree[filePath]; // lookup by exact key: no filesystem paths from the request, so no traversal
    if (!entry || !/^[a-f0-9]{64}$/.test(entry.h)) return send(res, 404, "Not found");
    let body = await fsp.readFile(path.join(STORAGE, "blobs", entry.h.slice(0, 2), entry.h));
    const ext = filePath.split(".").pop().toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    const isHtml = ext === "html" || ext === "htm";
    if (isHtml) body = injectSdk(body);
    send(res, 200, req.method === "HEAD" ? undefined : body, {
      "Content-Type": type,
      "Content-Security-Policy": CSP,
      // Sandboxed frames have an opaque ("null") origin, so fetch()/modules need CORS to load their own files.
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": isHtml ? "public, max-age=60" : "public, max-age=31536000, immutable",
    });
  } catch (e) {
    console.error(e);
    send(res, 500, "Server error");
  }
});

server.listen(PORT, () => console.log(`Arcadia play server on http://localhost:${PORT} (storage: ${STORAGE})`));
