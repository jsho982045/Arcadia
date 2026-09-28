import type { CheckItem, CheckReport } from "./db/schema";
import { config } from "./config";

/**
 * Automatic checks run on every upload, commit and pull request.
 * "fail" blocks publishing/merging. "warn" is shown to reviewers and owners.
 * The sandbox (separate origin + CSP) is the real protection; these checks catch mistakes early
 * and flag suspicious code for humans.
 */
const BLOCKED_EXT = /\.(exe|dll|so|dylib|bat|cmd|sh|ps1|php|py|rb|jar|msi|apk|dmg|app|scr|vbs)$/i;
const TEXT_EXT = /\.(html?|js|mjs|cjs|css|json|txt|md|svg|xml|glsl|frag|vert|csv)$/i;
const ALLOWED_EXTERNAL = [/^https?:\/\/(www\.)?w3\.org\//, /^https?:\/\/localhost/, /^https?:\/\/schemas\./];

export function normalizePath(p: string): string | null {
  const cleaned = p.replace(/\\/g, "/").replace(/^\.?\//, "");
  if (!cleaned || cleaned.endsWith("/")) return null;
  const parts = cleaned.split("/");
  if (parts.some((x) => x === ".." || x === "" || x === "." )) return null;
  if (parts.some((x) => x.startsWith(".") && x !== ".well-known")) return null; // hidden files (.git, .DS_Store)
  if (parts[0] === "__MACOSX") return null;
  if (!/^[\w\-./ ()@+]+$/.test(cleaned)) return null;
  return cleaned;
}

export function runChecks(files: Record<string, Buffer>): CheckReport {
  const items: CheckItem[] = [];
  const paths = Object.keys(files);
  const total = Object.values(files).reduce((a, b) => a + b.length, 0);

  if (!files["index.html"]) items.push({ level: "fail", message: "No index.html at the top level of the game." });
  else items.push({ level: "pass", message: "Found index.html." });

  if (paths.length > config.maxFiles) items.push({ level: "fail", message: `Too many files (${paths.length}, max ${config.maxFiles}).` });
  if (total > config.maxUploadBytes)
    items.push({ level: "fail", message: `Game is ${(total / 1048576).toFixed(1)} MB; the limit is ${config.maxUploadBytes / 1048576} MB.` });
  else items.push({ level: "pass", message: `Size ${(total / 1048576).toFixed(2)} MB is within the limit.` });

  for (const p of paths) {
    if (BLOCKED_EXT.test(p)) items.push({ level: "fail", message: "File type not allowed in games.", file: p });
  }

  if (files["arcadia.json"]) {
    try {
      const m = JSON.parse(files["arcadia.json"].toString("utf8"));
      if (typeof m !== "object" || Array.isArray(m)) throw new Error();
      items.push({ level: "pass", message: "arcadia.json manifest is valid." });
    } catch {
      items.push({ level: "fail", message: "arcadia.json is not valid JSON.", file: "arcadia.json" });
    }
  }

  let externalCount = 0;
  for (const p of paths) {
    if (!TEXT_EXT.test(p)) continue;
    const src = files[p].toString("utf8");
    const urls = src.match(/https?:\/\/[^\s"'`)<>]+/g) || [];
    const external = urls.filter((u) => !ALLOWED_EXTERNAL.some((r) => r.test(u)));
    if (external.length && /\.(html?|js|mjs|css)$/i.test(p)) {
      externalCount++;
      if (externalCount <= 5)
        items.push({
          level: "warn",
          message: `References an external URL (${external[0].slice(0, 60)}). The sandbox blocks network requests, so bundle all assets with the game.`,
          file: p,
        });
    }
    if (/\.(m?js|html?)$/i.test(p)) {
      if (/\beval\s*\(|new\s+Function\s*\(/.test(src))
        items.push({ level: "warn", message: "Uses eval() or new Function(). Reviewers will look closely.", file: p });
      if (/\b(document\.cookie|navigator\.sendBeacon|WebSocket\s*\()/.test(src))
        items.push({ level: "warn", message: "Touches cookies, beacons or WebSockets, which are blocked in the sandbox.", file: p });
      const longLine = src.split("\n").some((l) => l.length > 20000 && (l.match(/\\x[0-9a-f]{2}/gi) || []).length > 500);
      if (longLine) items.push({ level: "warn", message: "Looks obfuscated (very long lines full of escape codes).", file: p });
      if (/coinhive|cryptonight|miner\.start/i.test(src)) items.push({ level: "fail", message: "Looks like a crypto miner.", file: p });
    }
  }

  const status = items.some((i) => i.level === "fail") ? "fail" : items.some((i) => i.level === "warn") ? "warn" : "pass";
  return { status, items };
}
