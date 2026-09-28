import type { Tree } from "./db/schema";

export type FileChange = { path: string; kind: "added" | "modified" | "deleted"; before?: string; after?: string };

/** Which files differ between two trees. */
export function changedFiles(base: Tree, head: Tree): FileChange[] {
  const paths = new Set([...Object.keys(base), ...Object.keys(head)]);
  const out: FileChange[] = [];
  for (const p of [...paths].sort()) {
    const b = base[p]?.h;
    const h = head[p]?.h;
    if (b === h) continue;
    out.push({ path: p, kind: !b ? "added" : !h ? "deleted" : "modified", before: b, after: h });
  }
  return out;
}

/**
 * File-level three-way merge.
 * base   = the version the fork started from
 * ours   = the target game's current version
 * theirs = the fork's current version
 * A file conflicts only when both sides changed it differently since base.
 */
export function mergeTrees(base: Tree, ours: Tree, theirs: Tree): { tree: Tree; conflicts: string[] } {
  const paths = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)]);
  const tree: Tree = {};
  const conflicts: string[] = [];
  for (const p of paths) {
    const b = base[p]?.h;
    const o = ours[p]?.h;
    const t = theirs[p]?.h;
    const oursChanged = o !== b;
    const theirsChanged = t !== b;
    let pick: "ours" | "theirs" = "ours";
    if (theirsChanged && !oursChanged) pick = "theirs";
    else if (theirsChanged && oursChanged && o !== t) {
      conflicts.push(p);
      continue;
    }
    const src = pick === "ours" ? ours[p] : theirs[p];
    if (src) tree[p] = src;
  }
  return { tree, conflicts: conflicts.sort() };
}

export function treeSize(tree: Tree) {
  return Object.values(tree).reduce((a, f) => a + f.s, 0);
}

export function isTextPath(p: string) {
  return /\.(html?|js|mjs|cjs|ts|css|json|txt|md|svg|xml|glsl|frag|vert|csv)$/i.test(p);
}
