import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { publishGame } from "@/app/actions/game";
import { CATEGORIES, LICENSES, config } from "@/lib/config";
import { ErrorNote } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Publish a game" };

export default async function NewGame({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser("/new");
  const { error } = await searchParams;
  return (
    <div className="mx-auto mt-10 grid max-w-5xl gap-8 lg:grid-cols-[1fr_320px]">
      <form action={publishGame} className="card space-y-5 p-6">
        <div>
          <h1 className="h-display text-3xl font-extrabold">Publish a game</h1>
          <p className="mt-1 text-sm text-muted">Any HTML5 game works: plain JavaScript, Phaser, PixiJS, Three.js, or web exports from Godot, Unity and GameMaker.</p>
        </div>
        <ErrorNote message={error} />
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <label className="flex cursor-pointer gap-3 rounded-xl border border-line p-4 has-[:checked]:border-brand-2 has-[:checked]:bg-brand-2/10">
            <input type="radio" name="source" value="zip" defaultChecked className="mt-1 accent-[#7c5cff]" />
            <span>
              <b>Upload a .zip</b>
              <br />
              <span className="text-sm text-muted">With an index.html at the top level</span>
            </span>
          </label>
          <label className="flex cursor-pointer gap-3 rounded-xl border border-line p-4 has-[:checked]:border-brand-2 has-[:checked]:bg-brand-2/10">
            <input type="radio" name="source" value="template" className="mt-1 accent-[#7c5cff]" />
            <span>
              <b>Start from a template</b>
              <br />
              <span className="text-sm text-muted">A tiny working game you edit in the browser</span>
            </span>
          </label>
        </fieldset>
        <div>
          <label className="label" htmlFor="zip">Game zip (max {config.maxUploadBytes / 1048576} MB)</label>
          <input id="zip" name="zip" type="file" accept=".zip,application/zip" className="input file:mr-3 file:rounded-lg file:border-0 file:bg-panel-2 file:px-3 file:py-1 file:text-ink" />
        </div>
        <div>
          <label className="label" htmlFor="title">Title</label>
          <input id="title" name="title" maxLength={80} className="input" placeholder="Leave empty to use the title from arcadia.json" />
        </div>
        <div>
          <label className="label" htmlFor="description">Description</label>
          <textarea id="description" name="description" rows={3} maxLength={2000} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="instructions">How to play</label>
          <input id="instructions" name="instructions" maxLength={1000} className="input" placeholder="Arrow keys to move, Space to jump" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="category">Category</label>
            <select id="category" name="category" className="input" defaultValue="arcade">
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="tags">Tags</label>
            <input id="tags" name="tags" className="input" placeholder="platformer, pixel art" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="license">Licence</label>
          <select id="license" name="license" className="input" defaultValue="arcadia-remix">
            {Object.entries(LICENSES).map(([k, l]) => <option key={k} value={k}>{l.label}: {l.summary}</option>)}
          </select>
        </div>
        <p className="text-xs text-dim">
          By publishing you confirm you own this game or have the right to publish it, and you agree to the <Link href="/terms" className="link">Creator terms</Link>.
          {!user.trusted && !user.isAdmin && " New creators' games are reviewed before they appear on the site (usually within a day)."}
        </p>
        <div className="flex justify-end">
          <SubmitButton pendingText="Uploading and checking…">Publish</SubmitButton>
        </div>
      </form>
      <aside className="space-y-4 text-sm">
        <div className="card p-5">
          <p className="h-display mb-2 font-bold">Optional: arcadia.json</p>
          <pre className="overflow-x-auto rounded-lg bg-bg p-3 text-xs text-muted">{`{
  "title": "Space Cats",
  "description": "…",
  "instructions": "Arrows to fly",
  "category": "action",
  "tags": ["space", "cats"],
  "thumbnail": "cover.png",
  "orientation": "landscape"
}`}</pre>
        </div>
        <div className="card p-5">
          <p className="h-display mb-2 font-bold">The game SDK</p>
          <p className="text-muted">It&apos;s loaded into your game automatically:</p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-bg p-3 text-xs text-muted">{`Arcadia.submitScore(1200)
Arcadia.save({ level: 3 })
Arcadia.load()   // last save
Arcadia.onPause(() => …)`}</pre>
          <p className="mt-2 text-muted">localStorage works too: it&apos;s saved to the player&apos;s account.</p>
        </div>
        <div className="card p-5 text-muted">
          <p className="h-display mb-2 font-bold text-ink">Sandbox rules</p>
          Games run isolated on their own domain with no network access. Bundle every asset (images, sounds, fonts) in the zip.
        </div>
      </aside>
    </div>
  );
}
