import { randomUUID } from "node:crypto";
import { and, eq, like } from "drizzle-orm";
import type { z } from "zod";
import type { Db } from "../db/client.ts";
import { cases, events, messages } from "../db/schema.ts";
import { draftKey, requestDraft, sentKey, type RequestTopic } from "../domain/customer-request.ts";
import { appLanguage } from "../domain/language.ts";
import { WorkflowError } from "./cases.ts";

type RequestTarget = { caseId: string; revision: number };
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function lockRequestCase(tx: Tx, { caseId, revision }: RequestTarget) {
  const [c] = await tx.select().from(cases).where(eq(cases.id, caseId)).for("update");
  if (!c) throw new WorkflowError("not_found", "Case not found.");
  if (c.revision !== revision) throw new WorkflowError("stale_request", "The evidence changed.");
  if (c.status !== "broker_review" && c.status !== "awaiting_information") {
    throw new WorkflowError("request_unavailable", "This case is not waiting for a customer request.");
  }
  return c;
}

export async function draftCustomerRequest(
  db: Db,
  input: RequestTarget & { topic: z.infer<typeof RequestTopic>; instruction: string },
) {
  await db.transaction(async (tx) => {
    const c = await lockRequestCase(tx, input);
    const [existing] = await tx.select({ id: messages.id }).from(messages).where(and(
      eq(messages.caseId, c.id), eq(messages.status, "draft"), like(messages.requestKey, `${draftKey(c.revision)}%`),
    )).limit(1);
    if (existing) return;
    const [draft] = await tx.insert(messages).values({
      caseId: c.id, direction: "outbound", channel: "demo", role: "customer", status: "draft",
      requestKey: `${draftKey(c.revision)}${randomUUID()}`,
      body: requestDraft(appLanguage(process.env), c.reference, input.topic, input.instruction),
    }).returning({ id: messages.id });
    await tx.insert(events).values({
      caseId: c.id, caseRevision: c.revision, operation: "draft_customer_request", result: "ok",
      detail: { draftId: draft!.id, topic: input.topic },
    });
    await tx.update(cases).set({ updatedAt: new Date() }).where(eq(cases.id, c.id));
  });
}

/** The demo inbox is DB-backed. Confirmation and demo delivery commit together. */
export async function finishCustomerRequest(
  db: Db,
  input: RequestTarget & { draftId: string; body: string | null },
) {
  await db.transaction(async (tx) => {
    const c = await lockRequestCase(tx, input);
    const [draft] = await tx.select().from(messages).where(and(
      eq(messages.caseId, c.id), eq(messages.id, input.draftId),
      eq(messages.status, "draft"), like(messages.requestKey, `${draftKey(c.revision)}%`),
    ));
    if (!draft) return; // already confirmed, discarded or unavailable on this revision
    const confirmed = input.body !== null;
    await tx.update(messages).set({ status: confirmed ? "confirmed" : "discarded" }).where(eq(messages.id, draft.id));
    await tx.insert(events).values({
      caseId: c.id, caseRevision: c.revision,
      operation: confirmed ? "confirm_customer_request" : "discard_customer_request", result: "ok",
      detail: { draftId: draft.id },
    });
    if (input.body !== null) {
      const [sent] = await tx.insert(messages).values({
        caseId: c.id, direction: "outbound", channel: "demo", role: "customer", status: "sent",
        body: input.body, requestKey: `${sentKey(c.revision)}${draft.id}`, attempts: 1,
      }).returning({ id: messages.id });
      await tx.insert(events).values({
        caseId: c.id, caseRevision: c.revision, operation: "send_customer_request", result: "ok", tool: "demo-inbox",
        detail: { messageId: sent!.id, draftId: draft.id },
      });
    }
    await tx.update(cases).set({ updatedAt: new Date() }).where(eq(cases.id, c.id));
  });
}
