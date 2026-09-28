import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { games, issues, pullRequests } from "@/lib/db/schema";
import { loadGame } from "@/lib/game-context";
import { isForkable } from "@/lib/games";
import { StatusPill, UserLink } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
import { forkAction, syncForkAction } from "@/app/actions/game";
import { SubmitButton } from "@/components/SubmitButton";

export async function generateMetadata({ params }: { params: Promise<{ owner: string; slug: string }> }) {
  const { owner, slug } = await params;
  const { game } = await loadGame(owner, slug);
  return { title: game.title, description: game.description.slice(0, 160) };
}

export default async function GameLayout({ children, params }: { children: React.ReactNode; params: Promise<{ owner: string; slug: string }> }) {
  const { owner: o, slug } = await params;
  const { game, owner, viewer, parent, isOwner, canMaintain, base } = await loadGame(o, slug);
  const isFork = game.status === "fork";
  const counts = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(issues).where(and(eq(issues.gameId, game.id), eq(issues.status, "open"))),
    db.select({ n: sql<number>`count(*)::int` }).from(pullRequests).where(and(eq(pullRequests.targetGameId, game.id), eq(pullRequests.status, "open"))),
    db.select({ n: sql<number>`count(*)::int` }).from(games).where(eq(games.forkOfId, game.id)),
  ]);
  const [openIssues, openPrs, forks] = counts.map((c) => Number(c[0].n));
  const myFork =
    viewer && !isOwner && !isFork
      ? (await db.select({ slug: games.slug }).from(games).where(and(eq(games.forkOfId, game.id), eq(games.ownerId, viewer.id))).limit(1))[0]
      : undefined;
  const forkPrOpen = isFork
    ? (await db.select({ number: pullRequests.number }).from(pullRequests).where(and(eq(pullRequests.sourceGameId, game.id), eq(pullRequests.status, "open"))).limit(1))[0]
    : undefined;

  const tabs = [
    { href: base, label: "Play" },
    { href: `${base}/code`, label: "Code" },
    ...(isFork ? [] : [{ href: `${base}/issues`, label: "Issues", count: openIssues }, { href: `${base}/pulls`, label: "Pull requests", count: openPrs }]),
    { href: `${base}/releases`, label: isFork ? "Commits" : "Releases" },
    ...(isOwner && !isFork ? [{ href: `${base}/settings`, label: "Settings" }] : []),
  ];

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <UserLink user={owner} /> <span>/</span> <span className="font-mono text-ink">{game.slug}</span>
            {game.status !== "published" && <StatusPill status={game.status} />}
          </div>
          <h1 className="h-display mt-1 truncate text-3xl font-black sm:text-4xl">{game.title}</h1>
          {parent && (
            <p className="mt-1 text-sm text-muted">
              Forked from{" "}
              <Link href={`/g/${parent.owner.username}/${parent.game.slug}`} className="link">
                {parent.owner.username}/{parent.game.slug}
              </Link>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isFork && isOwner && (
            <>
              <Link href={`${base}/edit`} className="btn-ghost">✎ Edit code</Link>
              <form action={syncForkAction}>
                <input type="hidden" name="gameId" value={game.id} />
                <SubmitButton className="btn-ghost" pendingText="Syncing…">⟳ Sync</SubmitButton>
              </form>
              {forkPrOpen ? (
                <Link href={`/g/${parent!.owner.username}/${parent!.game.slug}/pulls/${forkPrOpen.number}`} className="btn-primary">View PR #{forkPrOpen.number}</Link>
              ) : (
                <Link href={`${base}/pulls/new`} className="btn-primary">Open pull request</Link>
              )}
            </>
          )}
          {!isFork && isOwner && <Link href={`${base}/edit`} className="btn-ghost">✎ Edit code</Link>}
          {!isFork && !isOwner && isForkable(game) &&
            (myFork ? (
              <Link href={`/g/${viewer!.username}/${myFork.slug}`} className="btn-ghost">Your fork →</Link>
            ) : (
              <form action={forkAction}>
                <input type="hidden" name="gameId" value={game.id} />
                <SubmitButton className="btn-ghost" pendingText="Forking…">
                  ⑂ Fork &amp; improve <span className="text-dim">{forks}</span>
                </SubmitButton>
              </form>
            ))}
          {canMaintain && !isOwner && <span className="chip">admin</span>}
        </div>
      </div>
      <Tabs tabs={tabs} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
