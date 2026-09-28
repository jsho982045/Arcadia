// Copies Monaco's prebuilt files to public/monaco so the editor is self-hosted (no CDN).
import fs from "node:fs";
import path from "node:path";
const src = path.resolve("node_modules/monaco-editor/min/vs");
const dest = path.resolve("public/monaco/vs");
if (!fs.existsSync(src)) {
  console.warn("monaco-editor not installed; skipping copy");
  process.exit(0);
}
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log("Copied Monaco to public/monaco/vs");
