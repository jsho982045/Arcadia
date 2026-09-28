import Link from "next/link";
import { loadGame } from "@/lib/game-context";
import { getBlob } from "@/lib/storage";
import { isTextPath, treeSize } from "@/lib/trees";
import { config } from "@/lib/config";
import { Empty } from "@/components/ui";

function fmt(n: number) {
  return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
}

export default async function CodePage({ params, searchParams }: { params: Promise<{ owner: string; slug: string }>; searchParams: Promise<{ path?: string }> }) {
  const { owner: o, slug } = await params;
  const sp = await searchParams;
  const { game, version, base, isOwner, viewer } = await loadGame(o, slug);
  if (!version) return <Empty title="No files yet" />;
  const paths = Object.keys(version.tree).sort((a, b) => {
    const da = a.includes("/"), db = b.includes("/");
    return da === db ? a.localeCompare(b) : da ? 1 : -1;
  });
  const selected = sp.path && version.tree[sp.path] ? sp.path : paths.includes("index.html") ? (paths.includes("game.js") ? "game.js" : "index.html") : paths[0];
  const entry = version.tree[selected];
  let text: string | null = null;
  if (entry && isTextPath(selected) && entry.s < 1_000_000) text = (await getBlob(entry.h)).toString("utf8");
  const isImage = /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(selected);

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="card h-fit overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3 text-sm">
          <span className="font-semibold">v{version.number}</span>
          <span className="text-dim">{paths.length} files · {fmt(treeSize(version.tree))}</span>
        </div>
        <ul className="max-h-[60vh] overflow-y-auto py-1 font-mono text-[13px]">
          {paths.map((p) => (
            <li key={p}>
              <Link
                href={`${base}/code?path=${encodeURIComponent(p)}`}
                className={`flex justify-between gap-2 px-4 py-1.5 hover:bg-panel-2 ${p === selected ? "bg-panel-2 text-ink" : "text-muted"}`}
              >
                <span className="truncate">{p}</span>
                <span className="shrink-0 text-dim">{fmt(version.tree[p].s)}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="space-y-2 border-t border-line p-3">
          <a href={`/api/versions/${version.id}/zip`} className="btn-ghost w-full">⬇ Download .zip</a>
          {isOwner ? (
            <Link href={`${base}/edit?path=${encodeURIComponent(selected)}`} className="btn-primary w-full">✎ Edit in browser</Link>
          ) : game.status !== "fork" && game.allowPrs ? (
            <p className="px-1 text-xs text-dim">Want to change something? {viewer ? "Fork the game (top right) to edit your own copy, then open a pull request." : "Sign in and fork the game to suggest changes."}</p>
          ) : null}
        </div>
      </aside>
      <section className="card min-w-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3 font-mono text-sm">
          <span>{selected}</span>
          {entry && <span className="text-dim">{fmt(entry.s)}</span>}
        </div>
        {text !== null ? (
          <pre className="max-h-[75vh] overflow-auto p-0 text-[13px] leading-6">
            <code className="block">
              {text.split("\n").map((line, i) => (
                <div key={i} className="flex hover:bg-panel-2/60">
                  <span className="w-12 shrink-0 select-none pr-3 text-right text-dim">{i + 1}</span>
                  <span className="whitespace-pre pr-4">{line || " "}</span>
                </div>
              ))}
            </code>
          </pre>
        ) : isImage ? (
          <div className="flex justify-center bg-[repeating-conic-gradient(#1d1934_0%_25%,#151226_0%_50%)] bg-[length:20px_20px] p-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${config.playOrigin}/v/${version.id}/${selected}`} alt={selected} className="max-h-[60vh]" />
          </div>
        ) : (
          <p className="p-6 text-sm text-muted">Binary file ({entry ? fmt(entry.s) : "?"}). Download the zip to view it.</p>
        )}
      </section>
    </div>
  );
}
