"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import MonacoEditor, { loader } from "@monaco-editor/react";

// Self-hosted Monaco (copied to /public/monaco on npm install), so the editor works without a CDN.
if (typeof window !== "undefined") loader.config({ paths: { vs: `${window.location.origin}/monaco/vs` } });
import { commitFiles } from "@/app/actions/game";
import { Player } from "./Player";

export type EditorFile = { path: string; size: number; text: boolean; content: string | null };
type Change = { path: string; content: string | null; base64?: boolean };

const LANG: Record<string, string> = { js: "javascript", mjs: "javascript", ts: "typescript", html: "html", htm: "html", css: "css", json: "json", md: "markdown", svg: "xml", xml: "xml", glsl: "cpp" };

export function Editor(props: {
  gameId: string;
  title: string;
  base: string;
  isFork: boolean;
  parentLabel: string | null;
  initialFiles: EditorFile[];
  initialVersionId: string;
  initialVersionNumber: number;
  playOrigin: string;
  orientation: string;
  initialPath?: string;
}) {
  const [files, setFiles] = useState<EditorFile[]>(props.initialFiles);
  const [saved, setSaved] = useState<Record<string, string | null>>(() => Object.fromEntries(props.initialFiles.map((f) => [f.path, f.content])));
  const [pending, setPending] = useState<Record<string, Change>>({});
  const firstText = props.initialFiles.find((f) => f.path === props.initialPath && f.text) ?? props.initialFiles.find((f) => f.path === "game.js") ?? props.initialFiles.find((f) => f.text);
  const [current, setCurrent] = useState<string | undefined>(firstText?.path);
  const [versionId, setVersionId] = useState(props.initialVersionId);
  const [versionNumber, setVersionNumber] = useState(props.initialVersionNumber);
  const [reloadKey, setReloadKey] = useState(0);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);
  const [isSaving, startSave] = useTransition();
  const uploadRef = useRef<HTMLInputElement>(null);

  const file = files.find((f) => f.path === current);
  const dirty = Object.keys(pending).length > 0;
  const ext = current?.split(".").pop()?.toLowerCase() ?? "";
  const tree = useMemo(() => files.map((f) => f.path).sort(), [files]);

  function edit(value: string | undefined) {
    if (!file || value === undefined) return;
    setFiles((fs) => fs.map((f) => (f.path === file.path ? { ...f, content: value } : f)));
    setPending((p) => {
      const next = { ...p };
      if (saved[file.path] === value) delete next[file.path];
      else next[file.path] = { path: file.path, content: value };
      return next;
    });
  }

  function newFile() {
    const name = prompt("New file name (e.g. levels.js or assets/data.json)");
    if (!name) return;
    const p = name.trim().replace(/^\/+/, "");
    if (files.some((f) => f.path === p)) return setCurrent(p);
    setFiles((fs) => [...fs, { path: p, size: 0, text: true, content: "" }]);
    setPending((x) => ({ ...x, [p]: { path: p, content: "" } }));
    setCurrent(p);
  }

  function removeFile(p: string) {
    if (!confirm(`Delete ${p}?`)) return;
    setFiles((fs) => fs.filter((f) => f.path !== p));
    setPending((x) => {
      const next = { ...x };
      if (saved[p] === undefined && !(p in saved)) delete next[p];
      else next[p] = { path: p, content: null };
      return next;
    });
    if (current === p) setCurrent(files.find((f) => f.path !== p && f.text)?.path);
  }

  async function uploadAssets(list: FileList | null) {
    if (!list) return;
    for (const f of Array.from(list)) {
      if (f.size > 10 * 1024 * 1024) { setStatus({ kind: "err", text: `${f.name} is over 10 MB.` }); continue; }
      const buf = new Uint8Array(await f.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      const p = `assets/${f.name.replace(/[^\w.\-]/g, "_")}`;
      setFiles((fs) => [...fs.filter((x) => x.path !== p), { path: p, size: f.size, text: false, content: null }]);
      setPending((x) => ({ ...x, [p]: { path: p, content: btoa(bin), base64: true } }));
    }
    setStatus({ kind: "info", text: "Assets added. Save to include them." });
  }

  function save() {
    const changes = Object.values(pending);
    if (!changes.length) return;
    startSave(async () => {
      setStatus({ kind: "info", text: "Saving and running checks…" });
      const r = await commitFiles({ gameId: props.gameId, message: message || `Update ${changes.map((c) => c.path).slice(0, 3).join(", ")}`, changes });
      if (!r.ok) {
        setStatus({ kind: "err", text: r.error });
        return;
      }
      setSaved((s) => {
        const next = { ...s };
        for (const c of changes) {
          if (c.content === null) delete next[c.path];
          else next[c.path] = c.base64 ? null : c.content;
        }
        return next;
      });
      setPending({});
      setMessage("");
      setVersionId(r.versionId);
      setVersionNumber(r.number);
      setReloadKey((k) => k + 1);
      const warns = r.checks.items.filter((i) => i.level === "warn").length;
      setStatus({ kind: "ok", text: `Saved as v${r.number}.${warns ? ` ${warns} warning(s) from checks.` : ""} ${props.isFork ? "Preview updated." : "It's live now."}` });
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted">
          Editing <b className="text-ink">{props.title}</b> · v{versionNumber}
          {props.isFork ? <> · your fork of <span className="font-mono text-ink">{props.parentLabel}</span></> : <span className="text-warn"> · saving publishes to players immediately</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Describe your change" className="input w-64" maxLength={300} />
          <button onClick={save} disabled={!dirty || isSaving} className="btn-primary" data-testid="save-button">
            {isSaving ? "Saving…" : `Save & run${dirty ? ` (${Object.keys(pending).length})` : ""}`}
          </button>
          {props.isFork && (
            <Link href={`${props.base}/pulls/new`} className="btn-ghost">
              Open pull request →
            </Link>
          )}
        </div>
      </div>
      {status && (
        <p className={`rounded-xl border px-3 py-2 text-sm ${status.kind === "ok" ? "border-ok/40 bg-ok/10 text-ok" : status.kind === "err" ? "border-bad/40 bg-bad/10 text-bad" : "border-line bg-panel text-muted"}`} data-testid="editor-status">
          {status.text}
        </p>
      )}
      <div className="grid gap-3 xl:grid-cols-[220px_minmax(0,1fr)_minmax(0,0.9fr)]">
        <aside className="card flex max-h-[75vh] flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-wide text-dim">
            Files
            <span className="flex gap-1">
              <button onClick={newFile} className="rounded px-1.5 py-0.5 hover:bg-panel-2 hover:text-ink" title="New file">＋</button>
              <button onClick={() => uploadRef.current?.click()} className="rounded px-1.5 py-0.5 hover:bg-panel-2 hover:text-ink" title="Upload images, sounds…">⇪</button>
              <input ref={uploadRef} type="file" multiple hidden onChange={(e) => uploadAssets(e.target.files)} />
            </span>
          </div>
          <ul className="flex-1 overflow-y-auto py-1 font-mono text-[13px]">
            {tree.map((p) => {
              const f = files.find((x) => x.path === p)!;
              return (
                <li key={p} className="group flex items-center">
                  <button
                    onClick={() => f.text && setCurrent(p)}
                    className={`flex-1 truncate px-3 py-1.5 text-left ${p === current ? "bg-panel-2 text-ink" : f.text ? "text-muted hover:text-ink" : "cursor-default text-dim"}`}
                    title={f.text ? p : `${p} (binary)`}
                  >
                    {pending[p] ? "● " : ""}
                    {p}
                  </button>
                  {p !== "index.html" && (
                    <button onClick={() => removeFile(p)} className="px-2 text-dim opacity-0 hover:text-bad group-hover:opacity-100" title="Delete">×</button>
                  )}
                </li>
              );
            })}
          </ul>
        </aside>
        <section className="card min-h-[60vh] overflow-hidden">
          {file && file.text ? (
            <MonacoEditor
              key={file.path}
              height="75vh"
              theme="vs-dark"
              path={file.path}
              defaultLanguage={LANG[ext] ?? "plaintext"}
              value={file.content ?? ""}
              onChange={edit}
              options={{ fontSize: 13, minimap: { enabled: false }, scrollBeyondLastLine: false, tabSize: 2, wordWrap: "on" }}
            />
          ) : (
            <p className="p-6 text-sm text-muted">Pick a file to edit.</p>
          )}
        </section>
        <section>
          <Player
            gameId={props.gameId}
            versionId={versionId}
            playOrigin={props.playOrigin}
            title={props.title}
            orientation={props.orientation}
            mode="preview"
            autoStart={reloadKey > 0}
            reloadKey={reloadKey}
            heightClass="h-[60vh]"
          />
          <p className="mt-2 text-xs text-dim">The preview runs your last saved version. Save to see changes.</p>
        </section>
      </div>
    </div>
  );
}
