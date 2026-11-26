// Case creation and evidence upload for the customer website. Plain server helpers so both the Server Actions
// (actions.ts) and the file-upload route handler (submit/route.ts) can use them with the right redirect status.
import { z } from "zod";
import type { Db } from "../../db/client.ts";
import { customers } from "../../db/schema.ts";
import { currentCustomer } from "../../server/customer-session.ts";
import { getDb } from "../../server/db.ts";
import { extractorFor } from "../../server/extractor.ts";
import { WorkflowError } from "../../workflow/cases.ts";
import {
  ACCEPTED_UPLOADS,
  MAX_UPLOAD_BYTES,
  MAX_UPLOADS,
  activeAgents,
  addCustomerFiles,
  createCustomerCase,
  customerCase,
  type CustomerUpload,
} from "../../workflow/customer-intake.ts";

const ACCEPTED: readonly string[] = ACCEPTED_UPLOADS;
type Customer = typeof customers.$inferSelect;

/** The signed-in customer, or nulls when an anonymous request must be sent to the landing page. */
export async function customerContext(): Promise<{ db: Db; customer: Customer } | { db: null; customer: null }> {
  const db = await getDb();
  const customer = await currentCustomer(db);
  return customer ? { db, customer } : { db: null, customer: null };
}

export function newClaimHref(input: { step: 1 | 2 | 3; agent?: string; message?: string; date?: string; error?: string }) {
  const query = new URLSearchParams({ step: String(input.step) });
  if (input.agent) query.set("agent", input.agent);
  if (input.message) query.set("message", input.message);
  if (input.date) query.set("date", input.date);
  if (input.error) query.set("error", input.error);
  return `/customer/new?${query.toString()}`;
}

type UploadResult = { uploads: CustomerUpload[] } | { error: string };

async function readUploads(formData: FormData): Promise<UploadResult> {
  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (!files.length) return { error: "no_files" };
  if (files.length > MAX_UPLOADS) return { error: "too_many" };
  const uploads: CustomerUpload[] = [];
  for (const file of files) {
    if (!ACCEPTED.includes(file.type)) return { error: "file_type" };
    if (file.size > MAX_UPLOAD_BYTES) return { error: "file_size" };
    uploads.push({
      name: file.name.slice(0, 200) || "upload",
      mediaType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  }
  return { uploads };
}

/** Open a case from the review step. Returns where to go next, including `?error=` pages. */
export async function submitClaim(formData: FormData): Promise<string> {
  const context = await customerContext();
  if (!context.customer) return "/customer?error=session";
  const { db, customer } = context;

  const agentId = z.uuid().safeParse(formData.get("agent"));
  const message = String(formData.get("message") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const back = (error: string) =>
    newClaimHref({ step: agentId.success ? 3 : 1, agent: agentId.data, message, date: date || undefined, error });

  if (!agentId.success) return back("agent");
  const parsed = z
    .object({ message: z.string().trim().min(10).max(4000), date: z.iso.date().or(z.literal("")) })
    .safeParse({ message, date });
  if (!parsed.success) {
    return back(parsed.error.issues.some((issue) => issue.path[0] === "date") ? "date" : "description");
  }

  const agent = (await activeAgents(db)).find((row) => row.id === agentId.data);
  if (!agent) return back("agent");

  const upload = await readUploads(formData);
  if ("error" in upload) return back(upload.error);

  const body = [parsed.data.message, parsed.data.date ? `Incident date: ${parsed.data.date}` : ""]
    .filter(Boolean)
    .join("\n\n");
  try {
    const caseId = await createCustomerCase(
      db,
      {
        // Keep the customer row the session points at, including a demo customer whose channel is WhatsApp.
        customer: { id: customer.id, name: customer.name, channel: customer.channel, address: customer.address },
        agentId: agent.id,
        message: body,
        files: upload.uploads,
      },
      await extractorFor(db, ""),
    );
    return `/customer/cases/${caseId}`;
  } catch (error) {
    if (error instanceof WorkflowError) return back("claim_failed");
    throw error;
  }
}

/** Add photos/documents to an existing case. The workflow increments the revision and re-runs extraction. */
export async function submitEvidence(formData: FormData): Promise<string> {
  const context = await customerContext();
  if (!context.customer) return "/customer?error=session";
  const { db, customer } = context;

  const caseId = z.uuid().safeParse(formData.get("caseId"));
  if (!caseId.success) return "/customer?error=not_found";
  const href = `/customer/cases/${caseId.data}`;

  // Ownership is checked against the session customer before anything is stored.
  if (!(await customerCase(db, customer.id, caseId.data))) return "/customer?error=not_found";
  const upload = await readUploads(formData);
  if ("error" in upload) return `${href}?error=${upload.error}`;
  const message = String(formData.get("message") ?? "").trim().slice(0, 4000);

  try {
    await addCustomerFiles(
      db,
      {
        caseId: caseId.data,
        message: message || `${upload.uploads.length} file(s) added from the customer website.`,
        files: upload.uploads,
      },
      await extractorFor(db, ""),
    );
  } catch (error) {
    if (error instanceof WorkflowError) {
      return `${href}?error=${error.code === "not_ready" ? "not_ready" : "upload_failed"}`;
    }
    throw error;
  }
  return `${href}?uploaded=1`;
}
