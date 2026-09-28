import { structuredPatch } from "diff";
import type { Tree } from "@/lib/db/schema";
import { changedFiles, isTextPath } from "@/lib/trees";
import { getBlob } from "@/lib/storage";
import { config } from "@/lib/config";

/** "Files changed" view: a unified diff per text file, side-by-side previews for images. */
export async function Diff({ base, head, baseVersionId, headVersionId }: { base: Tree; head: Tree; baseVersionId: string; headVersionId: string }) {
  const changes = changedFiles(base, head);
  if (!changes.length) return <p className="text-sm text-muted">No file changes.</p>;
  let adds = 0,
    dels = 0;
  const rendered = await Promise.all(
    changes.map(async (ch) => {
      if (!isTextPath(ch.path)) return { ch, hunks: null };
      const a = ch.before ? (await getBlob(ch.before)).toString("utf8") : "";
      const b = ch.after ? (await getBlob(ch.after)).toString("utf8") : "";
      if (a.length + b.length > 2_000_000) return { ch, hunks: null };
      const p = structuredPatch(ch.path, ch.path, a, b, "", "", { context: 3 });
      for (const h of p.hunks)
        for (const l of h.lines) {
          if (l[0] === "+") adds++;
          else if (l[0] === "-") dels++;
        }
      return { ch, hunks: p.hunks };
    }),
  );
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {changes.length} file{changes.length > 1 ? "s" : ""} changed · <span className="text-ok">+{adds}</span> <span className="text-bad">−{dels}</span>
      </p>
      {rendered.map(({ ch, hunks }) => (
        <details key={ch.path} open={changes.length <= 8} className="card overflow-hidden">
          <summary className="flex cursor-pointer items-center gap-3 border-b border-line bg-panel-2 px-4 py-2 font-mono text-sm">
            <span className={`rounded px-1.5 text-xs font-bold uppercase ${ch.kind === "added" ? "bg-ok/20 text-ok" : ch.kind === "deleted" ? "bg-bad/20 text-bad" : "bg-warn/20 text-warn"}`}>{ch.kind}</span>
            {ch.path}
          </summary>
          {hunks ? (
            <div className="overflow-x-auto font-mono text-[12.5px] leading-5">
              {hunks.map((h, i) => {
                let o = h.oldStart,
                  n = h.newStart;
                return (
                  <div key={i}>
                    <div className="diff-hunk px-4 py-1">@@ −{h.oldStart},{h.oldLines} +{h.newStart},{h.newLines} @@</div>
                    {h.lines.map((l, j) => {
                      const t = l[0];
                      const on = t === "+" ? "" : o++;
                      const nn = t === "-" ? "" : n++;
                      return (
                        <div key={j} className={`flex ${t === "+" ? "diff-add" : t === "-" ? "diff-del" : ""}`}>
                          <span className="w-12 shrink-0 select-none pr-2 text-right text-dim">{on}</span>
                          <span className="w-12 shrink-0 select-none pr-2 text-right text-dim">{nn}</span>
                          <span className={`w-5 shrink-0 select-none text-center ${t === "+" ? "text-ok" : t === "-" ? "text-bad" : "text-dim"}`}>{t === " " ? "" : t}</span>
                          <span className="whitespace-pre pr-4">{l.slice(1) || " "}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ) : /\.(png|jpe?g|gif|webp|svg)$/i.test(ch.path) ? (
            <div className="grid grid-cols-2 gap-4 p-4 text-center text-xs text-dim">
              <div>
                <p className="mb-2">Before</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {ch.before ? <img src={`${config.playOrigin}/v/${baseVersionId}/${ch.path}`} alt="" className="mx-auto max-h-48" /> : "—"}
              </div>
              <div>
                <p className="mb-2">After</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {ch.after ? <img src={`${config.playOrigin}/v/${headVersionId}/${ch.path}`} alt="" className="mx-auto max-h-48" /> : "—"}
              </div>
            </div>
          ) : (
            <p className="px-4 py-3 text-sm text-dim">Binary file changed.</p>
          )}
        </details>
      ))}
    </div>
  );
}
