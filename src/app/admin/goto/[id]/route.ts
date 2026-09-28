import { redirect } from "next/navigation";
import { getGameWithOwner } from "@/lib/games";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getGameWithOwner(id);
  redirect(row ? `/g/${row.owner.username}/${row.game.slug}` : "/admin");
}
