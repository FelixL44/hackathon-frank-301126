// Serves one evidence file version. The storage key comes from the database, never from the URL.
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { artifacts } from "../../../../../../../db/schema.ts";
import { getDb } from "../../../../../../../server/db.ts";
import { readObject } from "../../../../../../../storage/objects.ts";

export const dynamic = "force-dynamic";

// Evidence is untrusted: only types a browser shows passively are served, and never as an active document.
const SERVABLE = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain"]);

const Params = z.object({ id: z.uuid(), sourceId: z.string().regex(/^[a-z0-9-]{1,64}$/), version: z.coerce.number().int().min(1) });

export async function GET(_req: Request, ctx: { params: Promise<Record<string, string>> }) {
  const params = Params.safeParse(await ctx.params);
  if (!params.success) return new Response("Not found", { status: 404 });
  const { id, sourceId, version } = params.data;
  const [artifact] = await (await getDb())
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.caseId, id), eq(artifacts.sourceId, sourceId), eq(artifacts.version, version)));
  if (!artifact) return new Response("Not found", { status: 404 });
  if (!SERVABLE.has(artifact.mediaType)) return new Response("Unsupported media type", { status: 415 });

  let bytes: Uint8Array;
  try {
    bytes = await readObject(artifact.objectKey);
  } catch {
    return new Response("Evidence file not available yet", { status: 404 });
  }
  return new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]), {
    headers: {
      "Content-Type": artifact.mediaType === "text/plain" ? "text/plain; charset=utf-8" : artifact.mediaType,
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Cache-Control": "private, max-age=300",
    },
  });
}
