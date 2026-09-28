import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { comments, users, type User } from "@/lib/db/schema";
import { Avatar, Prose, timeAgo, UserLink } from "./ui";
import { addComment } from "@/app/actions/game";
import { SubmitButton } from "./SubmitButton";

/** The comment timeline under an issue or pull request, plus the reply box. */
export async function Thread({ targetType, targetId, back, viewer, refBase }: { targetType: "issue" | "pr"; targetId: string; back: string; viewer: User | null; refBase: string }) {
  const rows = await db
    .select({ c: comments, author: users })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(and(eq(comments.targetType, targetType), eq(comments.targetId, targetId)))
    .orderBy(asc(comments.createdAt));
  return (
    <div className="space-y-4">
      {rows.map(({ c, author }) =>
        c.kind === "event" ? (
          <p key={c.id} className="flex items-center gap-2 pl-4 text-sm text-muted">
            <span className="h-2 w-2 rounded-full bg-brand-2" />
            <UserLink user={author} /> {c.body} <span className="text-dim">· {timeAgo(c.createdAt)}</span>
          </p>
        ) : (
          <div key={c.id} className="flex gap-3">
            <Avatar name={author.displayName} size={36} />
            <div className="card min-w-0 flex-1">
              <p className="border-b border-line px-4 py-2 text-sm">
                <UserLink user={author} avatar={false} /> <span className="text-dim">commented {timeAgo(c.createdAt)}</span>
              </p>
              <div className="px-4 py-3">
                <Prose text={c.body} base={refBase} />
              </div>
            </div>
          </div>
        ),
      )}
      {viewer ? (
        <form action={addComment} className="flex gap-3">
          <Avatar name={viewer.displayName} size={36} />
          <div className="card flex-1 space-y-3 p-3">
            <input type="hidden" name="targetType" value={targetType} />
            <input type="hidden" name="targetId" value={targetId} />
            <input type="hidden" name="back" value={back} />
            <textarea name="body" required rows={4} maxLength={5000} className="input" placeholder="Leave a comment. Reference issues with #number." />
            <div className="flex justify-end">
              <SubmitButton pendingText="Posting…">Comment</SubmitButton>
            </div>
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted">
          <Link href={`/login?next=${encodeURIComponent(back)}`} className="link">Sign in</Link> to join the conversation.
        </p>
      )}
    </div>
  );
}
