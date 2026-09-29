import { redirect } from "next/navigation";
import { loadGame } from "@/lib/game-context";
import { CATEGORIES, LICENSES } from "@/lib/config";
import { archiveGame, updateSettings } from "@/app/actions/game";
import { SubmitButton } from "@/components/SubmitButton";

export default async function SettingsPage({ params, searchParams }: { params: Promise<{ owner: string; slug: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { owner: o, slug } = await params;
  const sp = await searchParams;
  const { game, base, canMaintain } = await loadGame(o, slug);
  if (!canMaintain) redirect(base);
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {sp.saved && <p className="rounded-xl border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ok">Saved.</p>}
      <form action={updateSettings} className="card space-y-5 p-6">
        <input type="hidden" name="gameId" value={game.id} />
        <h2 className="h-display text-xl font-bold">Game details</h2>
        <div>
          <label className="label" htmlFor="title">Title</label>
          <input id="title" name="title" defaultValue={game.title} maxLength={80} className="input" required />
        </div>
        <div>
          <label className="label" htmlFor="description">Description</label>
          <textarea id="description" name="description" defaultValue={game.description} rows={4} maxLength={2000} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="instructions">How to play</label>
          <input id="instructions" name="instructions" defaultValue={game.instructions} maxLength={1000} className="input" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="category">Category</label>
            <select id="category" name="category" defaultValue={game.category} className="input">
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="orientation">Screen</label>
            <select id="orientation" name="orientation" defaultValue={game.orientation} className="input">
              <option value="landscape">Landscape</option>
              <option value="portrait">Portrait / tall</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="tags">Tags (comma separated)</label>
            <input id="tags" name="tags" defaultValue={game.tags.join(", ")} className="input" />
          </div>
        </div>

        <h2 className="h-display pt-4 text-xl font-bold">Collaboration</h2>
        <div>
          <label className="label" htmlFor="license">Licence</label>
          <select id="license" name="license" defaultValue={game.license} className="input">
            {Object.entries(LICENSES).map(([k, l]) => <option key={k} value={k}>{l.label}: {l.summary}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="allowPrs" defaultChecked={game.allowPrs} className="accent-[#f07800]" /> Accept forks and pull requests
        </label>
        <div>
          <label className="label" htmlFor="contributorShare">Contributor share of this game&apos;s earnings: {game.contributorShare}%</label>
          <input id="contributorShare" name="contributorShare" type="number" min={0} max={50} defaultValue={game.contributorShare} className="input w-32" />
          <p className="mt-1 text-xs text-dim">Split between people whose pull requests you merged, by the points you gave them. Only applies once someone has contributed.</p>
        </div>
        <div className="flex justify-end">
          <SubmitButton pendingText="Saving…">Save settings</SubmitButton>
        </div>
      </form>

      <form action={archiveGame} className="card flex flex-wrap items-center justify-between gap-4 border-bad/30 p-6">
        <input type="hidden" name="gameId" value={game.id} />
        <div>
          <h2 className="font-bold">{game.status === "archived" ? "Unarchive game" : "Archive game"}</h2>
          <p className="text-sm text-muted">{game.status === "archived" ? "Make it playable and listed again." : "Hide it from the site. Nothing is deleted and you can bring it back."}</p>
        </div>
        <button className="btn-danger">{game.status === "archived" ? "Unarchive" : "Archive"}</button>
      </form>
    </div>
  );
}
