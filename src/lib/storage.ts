import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config";
import type { Tree } from "./db/schema";

/**
 * Content-addressed file storage.
 *   blobs/<ab>/<sha256>      file contents (deduplicated across every game, fork and version)
 *   trees/<versionId>.json   path -> blob map for one immutable version (read by the play server)
 *
 * Local disk works for dev and for a single-server deploy with a persistent volume.
 * To move to R2/S3, re-implement these five functions; nothing else touches the disk.
 */
const root = () => path.resolve(config.storageDir);

export function sha256(buf: Buffer | string) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function blobPath(hash: string) {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("bad blob hash");
  return path.join(root(), "blobs", hash.slice(0, 2), hash);
}

export async function putBlob(buf: Buffer): Promise<string> {
  const hash = sha256(buf);
  const p = blobPath(hash);
  if (!fs.existsSync(p)) {
    await fsp.mkdir(path.dirname(p), { recursive: true });
    const tmp = p + "." + crypto.randomBytes(4).toString("hex");
    await fsp.writeFile(tmp, buf);
    await fsp.rename(tmp, p);
  }
  return hash;
}

export async function getBlob(hash: string): Promise<Buffer> {
  return fsp.readFile(blobPath(hash));
}

export async function putTree(versionId: string, tree: Tree) {
  const p = path.join(root(), "trees", `${versionId}.json`);
  await fsp.mkdir(path.dirname(p), { recursive: true });
  await fsp.writeFile(p, JSON.stringify(tree));
}

export async function readFileFromTree(tree: Tree, filePath: string): Promise<Buffer | null> {
  const entry = tree[filePath];
  if (!entry) return null;
  return getBlob(entry.h);
}

/** Store a set of files and return the tree that describes them. */
export async function storeFiles(files: Record<string, Buffer>): Promise<Tree> {
  const tree: Tree = {};
  for (const [p, buf] of Object.entries(files)) {
    tree[p] = { h: await putBlob(buf), s: buf.length };
  }
  return tree;
}
