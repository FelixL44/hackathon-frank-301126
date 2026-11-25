// Private object storage for evidence files.
// shortcut: uploads use the local filesystem only; add an S3/R2 driver (STORAGE_DRIVER=s3) before real uploads go online.
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { FIXTURE_FILES } from "./fixture-files.ts";

const UPLOADS = join(process.cwd(), ".data", "objects"); // everything that is not a fixture

export async function readObject(key: string): Promise<Uint8Array> {
  if (key.startsWith("fixtures/")) {
    // Committed synthetic evidence, embedded so it also works on Cloudflare Workers.
    const name = key.slice("fixtures/".length);
    if (name.split("/").includes("..")) throw new Error(`object key escapes its storage root: ${key}`);
    const data = Object.hasOwn(FIXTURE_FILES, name) ? FIXTURE_FILES[name] : undefined;
    if (data === undefined) throw Object.assign(new Error(`fixture object not found: ${key}`), { code: "ENOENT" });
    return new Uint8Array(Buffer.from(data, "base64"));
  }
  const path = resolve(UPLOADS, key);
  if (!path.startsWith(UPLOADS + sep)) throw new Error(`object key escapes its storage root: ${key}`);
  return new Uint8Array(await readFile(path));
}
