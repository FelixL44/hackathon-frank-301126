// Private object storage for evidence files.
// shortcut: local filesystem only; add an S3-compatible driver (STORAGE_DRIVER=s3) before deploying.
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

// Fixed roots so the Next.js build traces only these folders, not the whole project.
const FIXTURES = join(process.cwd(), "fixtures", "files"); // committed synthetic evidence ("fixtures/…" keys)
const UPLOADS = join(process.cwd(), ".data", "objects"); // everything else

export async function readObject(key: string): Promise<Uint8Array> {
  const [root, relative] = key.startsWith("fixtures/") ? [FIXTURES, key.slice("fixtures/".length)] : [UPLOADS, key];
  const path = resolve(root, relative);
  if (!path.startsWith(root + sep)) throw new Error(`object key escapes its storage root: ${key}`);
  return new Uint8Array(await readFile(path));
}
