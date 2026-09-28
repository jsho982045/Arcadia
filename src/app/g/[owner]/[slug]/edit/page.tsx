import { redirect } from "next/navigation";
import { loadGame } from "@/lib/game-context";
import { requireUser } from "@/lib/auth";
import { getBlob } from "@/lib/storage";
import { isTextPath } from "@/lib/trees";
import { config } from "@/lib/config";
import { Editor, type EditorFile } from "@/components/Editor";

export const metadata = { title: "Editor" };

export default async function EditPage({ params, searchParams }: { params: Promise<{ owner: string; slug: string }>; searchParams: Promise<{ path?: string }> }) {
  const { owner: o, slug } = await params;
  const sp = await searchParams;
  const { game, base, isOwner, version, parent } = await loadGame(o, slug);
  await requireUser(`${base}/edit`);
  if (!isOwner || !version) redirect(base);
  const files: EditorFile[] = [];
  for (const [p, f] of Object.entries(version.tree)) {
    const text = isTextPath(p) && f.s < 1_000_000;
    files.push({ path: p, size: f.s, text, content: text ? (await getBlob(f.h)).toString("utf8") : null });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return (
    <Editor
      gameId={game.id}
      title={game.title}
      base={base}
      isFork={game.status === "fork"}
      parentLabel={parent ? `${parent.owner.username}/${parent.game.slug}` : null}
      initialFiles={files}
      initialVersionId={version.id}
      initialVersionNumber={version.number}
      playOrigin={config.playOrigin}
      orientation={game.orientation}
      initialPath={sp.path}
    />
  );
}
