// Customer website intake: the same case workflow, opened from the web channel with files the customer uploaded.
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { agents, cases, type MessageAttachment } from "../db/schema.ts";
import type { ArtifactKind } from "../domain/schema.ts";
import { writeObject } from "../storage/objects.ts";
import { addEvidence, openCase, type Extractor, type UploadedEvidence } from "./cases.ts";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOADS = 8;
export const ACCEPTED_UPLOADS = ["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain"] as const;

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "text/plain": "txt",
};

/** The DB only stores the three evidence kinds; a PDF is treated as a document/estimate. */
export function evidenceKind(mediaType: string): ArtifactKind {
  if (mediaType.startsWith("image/")) return "photo";
  if (mediaType === "text/plain") return "message";
  return "estimate";
}

export type CustomerUpload = { name: string; mediaType: string; bytes: Uint8Array };

function validate(files: CustomerUpload[]) {
  if (files.length > MAX_UPLOADS) throw new Error(`Upload at most ${MAX_UPLOADS} files at once.`);
  for (const file of files) {
    if (!ACCEPTED_UPLOADS.includes(file.mediaType as (typeof ACCEPTED_UPLOADS)[number])) {
      throw new Error(`Unsupported file type: ${file.mediaType || "unknown"}. Use JPG, PNG, WebP, PDF or TXT.`);
    }
    if (!file.bytes.length) throw new Error(`The file “${file.name}” is empty.`);
    if (file.bytes.length > MAX_UPLOAD_BYTES) throw new Error(`“${file.name}” is larger than 10 MB.`);
  }
}

async function store(files: CustomerUpload[], caseId?: string) {
  return Promise.all(
    files.map(async (file) => {
      const extension = EXTENSION[file.mediaType] ?? "bin";
      const key = await writeObject(`${caseId ?? "intake"}/${randomUUID()}.${extension}`, file.bytes);
      return { ...file, objectKey: key, kind: evidenceKind(file.mediaType) };
    }),
  );
}

/** Opens a case from the customer website: chosen agent, description, uploaded evidence. */
export async function createCustomerCase(
  db: Db,
  input: {
    customer: { id: string; name: string; channel: "web" | "whatsapp" | "teams" | "telegram" | "demo"; address: string };
    agentId: string;
    message: string;
    files: CustomerUpload[];
  },
  extractor: Extractor,
) {
  validate(input.files);
  const stored = await store(input.files);
  let photos = 0;
  let documents = 0;
  let notes = 0;
  const artifacts = stored.map((file) => ({
    sourceId:
      file.kind === "photo" ? `photo-${++photos}` : file.kind === "message" ? `message-${++notes}` : `estimate-${++documents}`,
    kind: file.kind,
    mediaType: file.mediaType,
    objectKey: file.objectKey,
  }));
  const attachments: MessageAttachment[] = stored.map((file, index) => ({
    sourceId: artifacts[index]!.sourceId,
    version: 1,
    kind: file.kind,
    name: file.name,
    mediaType: file.mediaType,
  }));
  return openCase(
    db,
    {
      message: input.message,
      artifacts,
      customer: { name: input.customer.name, channel: input.customer.channel, address: input.customer.address },
      agentId: input.agentId,
      channel: "web",
      attachments,
    },
    extractor,
  );
}

/** Adds files to an existing case; this increments the revision and re-runs extraction. */
export async function addCustomerFiles(
  db: Db,
  input: { caseId: string; message: string; files: CustomerUpload[] },
  extractor: Extractor,
) {
  validate(input.files);
  const stored = await store(input.files, input.caseId);
  const files: UploadedEvidence[] = stored.map((file) => ({
    kind: file.kind,
    mediaType: file.mediaType,
    objectKey: file.objectKey,
    name: file.name,
  }));
  return addEvidence(db, input.caseId, { message: input.message, files, channel: "web" }, extractor);
}

/** The customer's own cases with the agent name, newest first. */
export async function customerCases(db: Db, customerId: string) {
  return db
    .select({
      id: cases.id,
      reference: cases.reference,
      status: cases.status,
      revision: cases.revision,
      updatedAt: cases.updatedAt,
      agentName: agents.name,
    })
    .from(cases)
    .leftJoin(agents, eq(agents.id, cases.agentId))
    .where(eq(cases.customerId, customerId))
    .orderBy(desc(cases.updatedAt));
}

/** One case, only if it belongs to this customer. */
export async function customerCase(db: Db, customerId: string, caseId: string) {
  const [row] = await db
    .select({
      id: cases.id,
      reference: cases.reference,
      status: cases.status,
      revision: cases.revision,
      updatedAt: cases.updatedAt,
      agentId: cases.agentId,
      agentName: agents.name,
      customerId: cases.customerId,
    })
    .from(cases)
    .leftJoin(agents, eq(agents.id, cases.agentId))
    .where(eq(cases.id, caseId));
  if (!row || row.customerId !== customerId) return null;
  const { customerId: _owner, ...view } = row;
  return view;
}

/** Active claim types the customer can choose from, in the admin's order. */
export async function activeAgents(db: Db) {
  const rows = await db.select().from(agents).orderBy(agents.sortOrder, agents.name);
  return rows.filter((agent) => agent.status === "active");
}
