// Database tables (HAC-6). Shapes mirror src/domain/schema.ts; Zod validates at the boundary, the DB enforces uniqueness.
// RLS without policies on every table: hosted Postgres APIs (e.g. Supabase Data API) see nothing; the app connects
// as table owner and is unaffected.
import { sql } from "drizzle-orm";
import {
  bigserial,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { ClaimFiling, EvidenceRef, Locator } from "../domain/schema.ts";
import { ArtifactKind, CaseStatus, FindingRule, Readability, RequiredField, SideEffect } from "../domain/schema.ts";

// Drizzle wants a non-empty tuple; Zod types some enum `.options` as a plain array.
const values = <T extends string>(e: { options: readonly T[] }) => e.options as unknown as [T, ...T[]];
const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const caseId = () =>
  uuid("case_id")
    .notNull()
    .references(() => cases.id);

export const cases = pgTable("cases", {
  id: id(),
  reference: text("reference").notNull().unique(),
  revision: integer("revision").notNull().default(1),
  status: text("status", { enum: values(CaseStatus) }).notNull().default("intake"),
  replyToken: text("reply_token").notNull().unique(),
  policyReference: text("policy_reference"),
  vehicleId: text("vehicle_id"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/** Every version is kept. A correction is a new row with the same source_id and supersedes_version set. */
export const artifacts = pgTable(
  "artifacts",
  {
    caseId: caseId(),
    sourceId: text("source_id").notNull(),
    version: integer("version").notNull(),
    supersedesVersion: integer("supersedes_version"),
    kind: text("kind", { enum: values(ArtifactKind) }).notNull(),
    mediaType: text("media_type").notNull(),
    objectKey: text("object_key").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.caseId, t.sourceId, t.version] })],
).enableRLS();

export const observations = pgTable(
  "observations",
  {
    id: id(),
    caseId: uuid("case_id").notNull(),
    sourceId: text("source_id").notNull(),
    version: integer("version").notNull(),
    field: text("field", { enum: values(RequiredField) }).notNull(),
    value: text("value"), // null = unknown
    normalized: text("normalized"),
    locator: jsonb("locator").$type<Locator>().notNull(),
    readability: text("readability", { enum: values(Readability) }).notNull(),
    createdAt: createdAt(),
  },
  // An observation must point at an artifact version that exists.
  (t) => [
    foreignKey({
      columns: [t.caseId, t.sourceId, t.version],
      foreignColumns: [artifacts.caseId, artifacts.sourceId, artifacts.version],
    }),
  ],
).enableRLS();

export const findings = pgTable("findings", {
  id: id(),
  caseId: caseId(),
  caseRevision: integer("case_revision").notNull(), // revision in which the finding was raised
  rule: text("rule", { enum: values(FindingRule) }).notNull(),
  field: text("field", { enum: values(RequiredField) }),
  evidence: jsonb("evidence").$type<EvidenceRef[]>().notNull(),
  explanation: text("explanation").notNull(),
  status: text("status", { enum: ["open", "resolved"] }).notNull().default("open"),
  resolvedBy: text("resolved_by"), // broker identity or demo session
  resolutionReason: text("resolution_reason"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: createdAt(),
}).enableRLS();

/**
 * Inbound and outbound correspondence. Outbound rows with status "pending" are the message outbox:
 * they are written in the same transaction as the case transition and sent by a worker.
 */
export const messages = pgTable(
  "messages",
  {
    id: id(),
    caseId: caseId(),
    direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
    channel: text("channel", { enum: ["demo", "email", "slack", "teams"] }).notNull(),
    role: text("role", { enum: ["customer", "workshop", "broker"] }).notNull(), // sender (inbound) or recipient (outbound)
    body: text("body").notNull(),
    externalEventId: text("external_event_id"), // inbound: provider event ID, dedupe key
    requestKey: text("request_key").unique(), // outbound: idempotency key for the send
    inReplyTo: uuid("in_reply_to"),
    status: text("status", { enum: ["received", "pending", "sent", "failed"] }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [unique("messages_inbound_dedupe").on(t.channel, t.externalEventId)],
).enableRLS();

export const tasks = pgTable("tasks", {
  id: id(),
  caseId: caseId(),
  caseRevision: integer("case_revision").notNull(),
  kind: text("kind", { enum: ["review_conflict", "review_invalid_extraction", "submission_failed"] }).notNull(),
  findingIds: jsonb("finding_ids").$type<string[]>().notNull().default([]),
  status: text("status", { enum: ["open", "done"] }).notNull().default("open"),
  createdAt: createdAt(),
}).enableRLS();

/** One approval per case revision: a double click hits the unique key and creates no second row. */
export const approvals = pgTable(
  "approvals",
  {
    id: id(),
    caseId: caseId(),
    revision: integer("revision").notNull(),
    approvedBy: text("approved_by").notNull(),
    payload: jsonb("payload").$type<ClaimFiling>().notNull(), // frozen snapshot
    createdAt: createdAt(),
  },
  (t) => [unique("approvals_one_per_revision").on(t.caseId, t.revision)],
).enableRLS();

/** Submission outbox: one row per approved revision, retried with the same idempotency key. */
export const submissions = pgTable(
  "submissions",
  {
    id: id(),
    caseId: caseId(),
    approvedRevision: integer("approved_revision").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    status: text("status", { enum: ["pending", "succeeded", "failed"] }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastErrorCategory: text("last_error_category"),
    portalReference: text("portal_reference"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("submissions_one_per_revision").on(t.caseId, t.approvedRevision)],
).enableRLS();

/** SIMULATED insurer portal storage. Separate from our records on purpose: it stands in for a foreign system. */
export const portalReceipts = pgTable("portal_receipts", {
  idempotencyKey: text("idempotency_key").primaryKey(), // repeat calls return this row
  portalReference: text("portal_reference").notNull().unique(),
  payload: jsonb("payload").$type<ClaimFiling>().notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/** Case timeline and audit log. IDs and outcomes only, never raw files or private message bodies. */
export const events = pgTable("events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  caseId: caseId(),
  caseRevision: integer("case_revision").notNull(),
  operation: text("operation").notNull(), // e.g. "intake", "extract", "decide", "side_effect"
  sideEffect: text("side_effect", { enum: values(SideEffect) }),
  tool: text("tool"), // tool or model, e.g. "anthropic:claude-sonnet-5-5"
  promptVersion: text("prompt_version"),
  result: text("result", { enum: ["ok", "error", "retry"] }).notNull(),
  errorCategory: text("error_category"),
  latencyMs: integer("latency_ms"),
  detail: jsonb("detail").$type<Record<string, unknown>>(),
  createdAt: createdAt(),
}).enableRLS();
