// Case workflow (HAC-7 slice): open → extract → decide → approve → submit → receipt.
// Every transition and its pending side effect are written in one transaction; side effects run after commit.
import { randomBytes } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { approvals, artifacts, cases, events, findings, messages, observations, submissions } from "../db/schema.ts";
import { decide } from "../domain/decide.ts";
import { prepareFiling } from "../domain/filing.ts";
import { ModelExtraction, type ArtifactKind, type ProposedObservation, type SideEffect } from "../domain/schema.ts";
import type { Portal } from "../portal/simulated.ts";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Exec = Db | Tx;

export type NewArtifact = { sourceId: string; kind: ArtifactKind; mediaType: string; objectKey: string };
/** Reads one artifact and proposes observations. Fixture-backed now; the real model plugs in here (HAC-8). */
export type Extractor = { name: string; extract(artifact: NewArtifact): Promise<ProposedObservation[]> };

export class WorkflowError extends Error {
  readonly code: "not_found" | "stale_approval" | "not_ready";
  constructor(code: WorkflowError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

const BROKER = "demo-broker"; // shortcut: single demo session, no auth; replace with real identity before multi-user use

async function logEvent(
  db: Exec,
  c: { id: string; revision: number },
  operation: string,
  extra: Partial<typeof events.$inferInsert> = {},
) {
  await db.insert(events).values({ caseId: c.id, caseRevision: c.revision, operation, result: "ok", ...extra });
}

export async function loadCase(db: Exec, caseId: string) {
  const [c] = await db.select().from(cases).where(eq(cases.id, caseId));
  if (!c) throw new WorkflowError("not_found", `case ${caseId} not found`);
  const arts = await db.select().from(artifacts).where(eq(artifacts.caseId, caseId)).orderBy(asc(artifacts.sourceId));
  const obs = await db.select().from(observations).where(eq(observations.caseId, caseId));
  return { case: c, artifacts: arts, observations: obs, ...prepareFiling(c, arts, obs) };
}

/** Everything the broker's case screen shows. */
export async function caseView(db: Db, caseId: string) {
  const state = await loadCase(db, caseId);
  return {
    ...state,
    messages: await db.select().from(messages).where(eq(messages.caseId, caseId)).orderBy(asc(messages.createdAt)),
    findings: await db.select().from(findings).where(eq(findings.caseId, caseId)).orderBy(asc(findings.createdAt)),
    events: await db.select().from(events).where(eq(events.caseId, caseId)).orderBy(asc(events.id)),
    submission: (await db.select().from(submissions).where(eq(submissions.caseId, caseId)))[0] ?? null,
    approval:
      (await db.select().from(approvals).where(eq(approvals.caseId, caseId)).orderBy(asc(approvals.revision))).at(-1) ??
      null,
  };
}

export async function openCase(
  db: Db,
  input: { message: string; artifacts: NewArtifact[] },
  extractor: Extractor,
): Promise<string> {
  const c = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(cases)
      .values({
        reference: `CLM-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`,
        replyToken: randomBytes(16).toString("hex"),
      })
      .returning();
    await tx.insert(artifacts).values(input.artifacts.map((a) => ({ ...a, caseId: row!.id, version: 1, supersedesVersion: null })));
    await tx.insert(messages).values({
      caseId: row!.id,
      direction: "inbound",
      channel: "demo",
      role: "customer",
      body: input.message,
      status: "received",
    });
    await logEvent(tx, row!, "intake", { detail: { artifacts: input.artifacts.map((a) => a.sourceId) } });
    return row!;
  });

  // Extraction runs outside the transaction (model calls are slow); results are stored per artifact version.
  for (const a of input.artifacts) {
    const started = Date.now();
    const { observations: proposed } = ModelExtraction.parse({ observations: await extractor.extract(a) });
    if (proposed.length) {
      await db.insert(observations).values(proposed.map((o) => ({ ...o, caseId: c.id, sourceId: a.sourceId, version: 1 })));
    }
    await logEvent(db, c, "extract", {
      tool: extractor.name,
      latencyMs: Date.now() - started,
      detail: { sourceId: a.sourceId, observations: proposed.length },
    });
  }

  await recompute(db, c.id);
  return c.id;
}

/** Re-derive findings and status from stored evidence. Safe to call any time before submission. */
export async function recompute(db: Db, caseId: string) {
  await db.transaction(async (tx) => {
    await tx.select({ id: cases.id }).from(cases).where(eq(cases.id, caseId)).for("update");
    const state = await loadCase(tx, caseId);
    if (state.case.status === "submitting" || state.case.status === "submitted") return;

    await tx.delete(findings).where(and(eq(findings.caseId, caseId), eq(findings.status, "open")));
    if (state.gaps.length) {
      await tx.insert(findings).values(
        state.gaps.map((g) => ({ ...g, caseId, caseRevision: state.case.revision, evidence: [] })),
      );
    }
    const rule = decide(state.gaps.map((g) => g.rule));
    await tx
      .update(cases)
      .set({
        status: rule.status,
        policyReference: state.filing?.policyReference ?? state.case.policyReference,
        vehicleId: state.filing?.vehicleId ?? state.case.vehicleId,
        updatedAt: new Date(),
      })
      .where(eq(cases.id, caseId));
    await logEvent(tx, state.case, "decide", {
      sideEffect: rule.action as SideEffect,
      detail: { rule: rule.name, status: rule.status, gaps: state.gaps.length },
    });
  });
}

/**
 * Broker approves one exact revision. Idempotent: a double click finds the case already submitting and does nothing.
 * A revision that is no longer current is rejected, so a stale screen can never approve newer evidence.
 */
export async function approve(db: Db, caseId: string, revision: number, portal: Portal) {
  const created = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(cases).where(eq(cases.id, caseId)).for("update");
    if (!locked) throw new WorkflowError("not_found", `case ${caseId} not found`);
    if (locked.revision !== revision) {
      throw new WorkflowError("stale_approval", `revision ${revision} is stale; current is ${locked.revision}`);
    }
    if (locked.status === "submitting" || locked.status === "submitted") return false; // already approved
    if (locked.status !== "awaiting_approval") throw new WorkflowError("not_ready", `case is ${locked.status}`);

    // The payload is rebuilt server-side from stored evidence, never taken from the browser.
    const { filing } = await loadCase(tx, caseId);
    if (!filing) throw new WorkflowError("not_ready", "filing is incomplete");
    await tx.insert(approvals).values({ caseId, revision, approvedBy: BROKER, payload: filing }).onConflictDoNothing();
    await tx
      .insert(submissions)
      .values({ caseId, approvedRevision: revision, idempotencyKey: `${caseId}:${revision}` })
      .onConflictDoNothing();
    await tx.update(cases).set({ status: "submitting", updatedAt: new Date() }).where(eq(cases.id, caseId));
    await logEvent(tx, locked, "approve", { sideEffect: "submit_claim", detail: { by: BROKER } });
    return true;
  });
  if (created) await dispatch(db, caseId, portal);
}

/** Send the pending submission to the portal. Retries with backoff come in HAC-12; this is the single attempt. */
export async function dispatch(db: Db, caseId: string, portal: Portal) {
  const [sub] = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.caseId, caseId), eq(submissions.status, "pending")));
  if (!sub) return;
  const [approval] = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.caseId, caseId), eq(approvals.revision, sub.approvedRevision)));
  const c = { id: caseId, revision: sub.approvedRevision };
  const started = Date.now();
  await db.update(submissions).set({ attempts: sub.attempts + 1, updatedAt: new Date() }).where(eq(submissions.id, sub.id));
  try {
    const { portalReference } = await portal.submit(sub.idempotencyKey, approval!.payload);
    await db.transaction(async (tx) => {
      await tx
        .update(submissions)
        .set({ status: "succeeded", portalReference, updatedAt: new Date() })
        .where(eq(submissions.id, sub.id));
      await tx.update(cases).set({ status: "submitted", updatedAt: new Date() }).where(eq(cases.id, caseId));
      await logEvent(tx, c, "submit", {
        tool: "simulated-portal",
        latencyMs: Date.now() - started,
        detail: { attempt: sub.attempts + 1, portalReference },
      });
    });
  } catch (e) {
    const errorCategory = e instanceof Error ? e.name : "unknown";
    await db.update(submissions).set({ lastErrorCategory: errorCategory, updatedAt: new Date() }).where(eq(submissions.id, sub.id));
    await logEvent(db, c, "submit", {
      tool: "simulated-portal",
      result: "error",
      errorCategory,
      latencyMs: Date.now() - started,
      detail: { attempt: sub.attempts + 1 },
    });
  }
}
