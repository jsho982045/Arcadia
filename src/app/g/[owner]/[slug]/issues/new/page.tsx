import { loadGame } from "@/lib/game-context";
import { requireUser } from "@/lib/auth";
import { createIssue } from "@/app/actions/game";
import { ErrorNote } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export default async function NewIssue({ params, searchParams }: { params: Promise<{ owner: string; slug: string }>; searchParams: Promise<{ error?: string }> }) {
  const { owner: o, slug } = await params;
  const { game, base } = await loadGame(o, slug);
  await requireUser(`${base}/issues/new`);
  const { error } = await searchParams;
  return (
    <form action={createIssue} className="card mx-auto max-w-3xl space-y-4 p-6">
      <h2 className="h-display text-2xl font-bold">New issue</h2>
      <ErrorNote message={error} />
      <input type="hidden" name="gameId" value={game.id} />
      <fieldset className="flex gap-3">
        <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-xl border border-line p-3 has-[:checked]:border-bad">
          <input type="radio" name="kind" value="bug" defaultChecked className="accent-[#d23a3a]" />
          <span><b>Bug</b><br /><span className="text-sm text-muted">Something is broken</span></span>
        </label>
        <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-xl border border-line p-3 has-[:checked]:border-brand-2">
          <input type="radio" name="kind" value="idea" className="accent-[#f07800]" />
          <span><b>Idea</b><br /><span className="text-sm text-muted">A feature or improvement</span></span>
        </label>
      </fieldset>
      <div>
        <label className="label" htmlFor="title">Title</label>
        <input id="title" name="title" required maxLength={140} className="input" placeholder="Ball goes through the paddle at high speed" />
      </div>
      <div>
        <label className="label" htmlFor="body">Details</label>
        <textarea id="body" name="body" rows={8} maxLength={10000} className="input" placeholder={"What happened? What did you expect?\nWhich browser and device?"} />
      </div>
      <div className="flex justify-end">
        <SubmitButton pendingText="Submitting…">Submit issue</SubmitButton>
      </div>
    </form>
  );
}
