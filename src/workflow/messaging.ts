// Chat over the existing messages table: the same thread serves the customer website, the broker's
// WhatsApp-style inbox and the case view. Nothing here sends to an external provider yet (HAC-27).
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { cases, customers, events, messages, type MessageAttachment, type Channel } from "../db/schema.ts";
import { WorkflowError } from "./cases.ts";

const VISIBLE = ["received", "sent", "confirmed"] as const;

/** The broker writes a free-text reply. It is recorded as sent in the unified inbox immediately. */
export async function sendBrokerMessage(db: Db, input: { caseId: string; body: string }) {
  const body = input.body.trim();
  if (!body) throw new WorkflowError("invalid_resolution", "Write a message first.");
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(cases).where(eq(cases.id, input.caseId)).for("update");
    if (!c) throw new WorkflowError("not_found", `case ${input.caseId} not found`);
    const [customer] = c.customerId
      ? await tx.select().from(customers).where(eq(customers.id, c.customerId))
      : [];
    const channel: Channel = customer?.channel ?? "web";
    const [message] = await tx
      .insert(messages)
      .values({
        caseId: c.id,
        direction: "outbound",
        channel,
        role: "customer",
        body: body.slice(0, 4000),
        status: "sent",
        requestKey: `broker-chat:${randomUUID()}`,
        attempts: 1,
      })
      .returning();
    await tx.insert(events).values({
      caseId: c.id,
      caseRevision: c.revision,
      operation: "send_broker_message",
      result: "ok",
      tool: "web-inbox",
      detail: { messageId: message!.id, channel },
    });
    await tx.update(cases).set({ updatedAt: new Date() }).where(eq(cases.id, c.id));
    return message!;
  });
}

/** A customer writes from the website. Text only; files are added through the evidence workflow. */
export async function sendCustomerMessage(
  db: Db,
  input: { caseId: string; customerId: string; body: string; attachments?: MessageAttachment[] },
) {
  const body = input.body.trim();
  if (!body && !input.attachments?.length) throw new WorkflowError("invalid_resolution", "Write a message or attach a file.");
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(cases).where(eq(cases.id, input.caseId)).for("update");
    if (!c || c.customerId !== input.customerId) throw new WorkflowError("not_found", "Case not found.");
    const [message] = await tx
      .insert(messages)
      .values({
        caseId: c.id,
        direction: "inbound",
        channel: "web",
        role: "customer",
        body: body.slice(0, 4000),
        status: "received",
        attachments: input.attachments ?? [],
      })
      .returning();
    await tx.insert(events).values({
      caseId: c.id,
      caseRevision: c.revision,
      operation: "customer_message",
      result: "ok",
      tool: "customer-web",
      detail: { messageId: message!.id, attachments: input.attachments?.length ?? 0 },
    });
    await tx.update(cases).set({ updatedAt: new Date() }).where(eq(cases.id, c.id));
    return message!;
  });
}

/** Only what a person wrote: drafts, discards and failed send attempts stay out of the chat. */
export async function caseThread(db: Db, caseId: string) {
  return db
    .select()
    .from(messages)
    .where(and(eq(messages.caseId, caseId), inArray(messages.status, [...VISIBLE])))
    .orderBy(asc(messages.createdAt), asc(messages.id));
}

/** One row per case for the broker's inbox, newest activity first. */
export async function chatCases(db: Db) {
  const latest = db
    .select({ body: messages.body, direction: messages.direction, createdAt: messages.createdAt })
    .from(messages)
    .where(and(eq(messages.caseId, cases.id), inArray(messages.status, [...VISIBLE])))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(1)
    .as("latest_message");
  return db
    .select({
      id: cases.id,
      reference: cases.reference,
      status: cases.status,
      updatedAt: cases.updatedAt,
      customerName: customers.name,
      customerChannel: customers.channel,
      customerAddress: customers.address,
      lastMessage: latest.body,
      lastDirection: latest.direction,
    })
    .from(cases)
    .leftJoin(customers, eq(customers.id, cases.customerId))
    .leftJoinLateral(latest, sql`true`)
    .orderBy(desc(cases.updatedAt));
}
