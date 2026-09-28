import Link from "next/link";
import { redirect } from "next/navigation";
import { loadGame } from "@/lib/game-context";
import { getVersion } from "@/lib/games";
import { changedFiles } from "@/lib/trees";
import { requireUser } from "@/lib/auth";
import { openPrAction } from "@/app/actions/game";
import { Diff } from "@/components/Diff";
import { ErrorNote } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export default async function NewPull({ params, searchParams }: { params: Promise<{ owner: string; slug: string }>; searchParams: Promise<{ error?: string }> }) {
  const { owner: o, slug } = await params;
  const { error } = await searchParams;
  const { game, base, parent, isOwner } = await loadGame(o, slug);
  await requireUser(`${base}/pulls/new`);
  if (!parent || !isOwner) redirect(base);
  const [head, baseV] = await Promise.all([getVersion(game.currentVersionId), getVersion(game.forkBaseVersionId)]);
  const changes = head && baseV ? changedFiles(baseV.tree, head.tree) : [];
  const target = `${parent.owner.username}/${parent.game.slug}`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="h-display text-2xl font-bold">Open a pull request</h2>
        <p className="text-sm text-muted">
          Suggest your changes to <Link href={`/g/${target}`} className="link">{target}</Link>. The owner can play your version, read the diff and merge it.
        </p>
      </div>
      <ErrorNote message={error} />
      {changes.length === 0 ? (
        <div className="card p-6 text-sm text-muted">
          Your fork has no changes yet. <Link href={`${base}/edit`} className="link">Open the editor</Link> to make some.
        </div>
      ) : (
        <form action={openPrAction} className="card space-y-4 p-6">
          <input type="hidden" name="gameId" value={game.id} />
          <div>
            <label className="label" htmlFor="title">Title</label>
            <input id="title" name="title" required maxLength={140} className="input" placeholder="Add a pause button" defaultValue={head && !/^(Forked|Synced)/.test(head.message) ? head.message : ""} />
          </div>
          <div>
            <label className="label" htmlFor="body">Description</label>
            <textarea id="body" name="body" rows={6} className="input" placeholder={"What does this change and why?\n\nFixes #3"} />
            <p className="mt-1 text-xs text-dim">Write “Fixes #12” to close issue 12 automatically when this is merged.</p>
          </div>
          <p className="text-xs text-dim">
            By opening a pull request you agree that, if merged, the owner may use your changes in this game under its licence. In return you&apos;re credited as a contributor and share in the game&apos;s contributor earnings.
          </p>
          <div className="flex justify-end">
            <SubmitButton pendingText="Opening…">Open pull request</SubmitButton>
          </div>
        </form>
      )}
      {head && baseV && changes.length > 0 && <Diff base={baseV.tree} head={head.tree} baseVersionId={baseV.id} headVersionId={head.id} />}
    </div>
  );
}
