// Case workflow: open → extract → decide → approve → submit → receipt.
// Every transition and its pending side effect are written in one transaction; side effects run after commit.
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, notInArray } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { artifacts, cases, events, findings, messages, observations, submissions } from "../db/schema.ts";
import { decide } from "../domain/decide.ts";
import { compareSources, conflictKey } from "../domain/compare.ts";
import { currentArtifacts, prepareFiling } from "../domain/filing.ts";
import {
  ModelExtraction,
  type ArtifactKind,
  type FindingRule,
  type RequiredField,
  type ProposedObservation,
  type SideEffect,
} from "../domain/schema.ts";
import { ExtractionError } from "../extraction/model-extractor.ts";
import type { Portal } from "../portal/simulated.ts";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Exec = Db | Tx;

export type NewArtifact = { sourceId: string; kind: ArtifactKind; mediaType: string; objectKey: string };
/** Reads one artifact and proposes observations: fixture-backed or model-backed (src/extraction/model-extractor.ts). */
export type Extractor = {
  name: string;
  promptVersion?: string;
  extract(
    artifact: NewArtifact,
  ): Promise<{ observations: ProposedObservation[]; attempts: number; costEur?: number; model?: string }>;
};

/** Findings that recompute() derives from observations; everything else (e.g. invalid_extraction) persists. */
const DERIVED_RULES: FindingRule[] = ["missing", "illegible", "ambiguous", "conflict"];

export class WorkflowError extends Error {
  readonly code: "not_found" | "stale_approval" | "not_ready" | "invalid_resolution" | "stale_request" | "request_unavailable";
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
  // Stable order, so the filing shown to the broker and the one frozen at approval pick the same values.
  const obs = await db
    .select()
    .from(observations)
    .where(eq(observations.caseId, caseId))
    .orderBy(asc(observations.sourceId), asc(observations.version), asc(observations.id));
  const found = await db.select().from(findings).where(eq(findings.caseId, caseId)).orderBy(asc(findings.createdAt));
  const resolved = found.filter((f) => f.status === "resolved" && f.rule === "conflict");
  const accepted = Object.fromEntries(
    resolved.filter((f) => f.field && f.acceptedSourceId).map((f) => [f.field, f.acceptedSourceId]),
  ) as Partial<Record<RequiredField, string>>;
  // A resolved conflict stays resolved until its evidence changes (a new version gives it a new key).
  const conflicts = compareSources(arts, obs).filter(
    (k) => !resolved.some((f) => conflictKey(f.field, f.evidence) === conflictKey(k.field, k.evidence)),
  );
  return { case: c, artifacts: arts, observations: obs, findings: found, conflicts, ...prepareFiling(c, arts, obs, accepted) };
}

/** Everything the broker's case screen shows. */
export async function caseView(db: Db, caseId: string) {
  const state = await loadCase(db, caseId);
  const history = await db.select().from(events).where(eq(events.caseId, caseId)).orderBy(asc(events.id));
  return {
    ...state,
    failedSources: failedExtractions(state, history).map(({ artifact }) => artifact.sourceId),
    messages: await db.select().from(messages).where(eq(messages.caseId, caseId)).orderBy(asc(messages.createdAt)),
    events: await db.select().from(events).where(eq(events.caseId, caseId)).orderBy(asc(events.id)),
    submission:
      (
        await db.select().from(submissions).where(eq(submissions.caseId, caseId)).orderBy(asc(submissions.approvedRevision))
      ).at(-1) ?? null,
  };
}

export async function openCase(
  db: Db,
  input: { message: string; artifacts: NewArtifact[]; fixtureId?: string },
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
    await logEvent(tx, row!, "intake", {
      // fixtureId lets an interrupted fixture case resume with the same fixture data
      detail: { artifacts: input.artifacts.map((a) => a.sourceId), fixtureId: input.fixtureId ?? null },
    });
    return row!;
  });
  await resumeCase(db, c.id, extractor);
  return c.id;
}

/** An `intake` case with no activity for this long was interrupted (crash, timeout, redeploy) and may be resumed. */
export const STALE_INTAKE_MS = 3 * 60_000;

/**
 * Extracts every current file that has no `extract` event yet, in parallel, then decides. Safe to call again after a
 * crash, and safe to run twice at once: each file's result is written in one transaction that first re-checks.
 */
export async function resumeCase(db: Db, caseId: string, extractor: Extractor) {
  const state = await loadCase(db, caseId);
  if (state.case.status !== "intake") return;
  const done = await extractedVersions(db, caseId);
  const pending = currentArtifacts(state.artifacts).filter((a) => !done.has(`${a.sourceId}@${a.version}`));

  const results = await Promise.allSettled(pending.map((a) => extractOne(db, state.case, a, extractor)));
  const crashed = results.find((r) => r.status === "rejected");
  if (crashed) throw crashed.reason; // stays in intake; the next resume continues with what is left
  await recompute(db, caseId);
}

async function extractedVersions(db: Exec, caseId: string) {
  const rows = await db
    .select({ detail: events.detail })
    .from(events)
    .where(and(eq(events.caseId, caseId), eq(events.operation, "extract")));
  return new Set(rows.map((r) => `${r.detail?.sourceId}@${r.detail?.version ?? 1}`));
}

function failedExtractions(
  state: Awaited<ReturnType<typeof loadCase>>,
  history: (typeof events.$inferSelect)[],
) {
  if (state.case.status !== "broker_review") return [];
  return currentArtifacts(state.artifacts).flatMap((artifact) => {
    const attempt = history.findLast((event) => event.operation === "extract" &&
      event.detail?.sourceId === artifact.sourceId && (event.detail?.version ?? 1) === artifact.version);
    return attempt?.result === "error" ? [{ artifact, attemptId: attempt.id }] : [];
  });
}

/** Retries failed current files, preserving the original audit history and other extracted observations. */
export async function retryExtraction(db: Db, caseId: string, revision: number, extractor: Extractor) {
  const state = await loadCase(db, caseId);
  if (state.case.revision !== revision) throw new WorkflowError("stale_approval", "The evidence changed before retry.");
  const history = await db.select().from(events).where(eq(events.caseId, caseId)).orderBy(asc(events.id));
  for (const { artifact, attemptId } of failedExtractions(state, history)) {
    await extractOne(db, state.case, artifact, extractor, attemptId);
  }
}

async function extractOne(
  db: Db, c: { id: string; revision: number }, a: NewArtifact & { version: number }, extractor: Extractor, retryOf?: number,
) {
  const started = Date.now();
  const run = { tool: extractor.name, promptVersion: extractor.promptVersion ?? null };
  type Outcome =
    | { ok: true; observations: ProposedObservation[]; attempts: number; costEur?: number; model?: string }
    | { ok: false; category: string; reason: string; attempts: number | null; costEur: number | null };
  let outcome: Outcome;
  try {
    const result = await extractor.extract(a);
    outcome = { ok: true, ...result, observations: ModelExtraction.parse({ observations: result.observations }).observations };
  } catch (e) {
    // Unusable model output never blocks silently: it becomes a finding that routes the case to the broker.
    const known = e instanceof ExtractionError;
    outcome = {
      ok: false,
      category: known ? e.category : "provider_error",
      reason: e instanceof Error ? e.message : String(e),
      attempts: known ? e.attempts : null,
      costEur: known ? e.costEur : null,
    };
  }

  await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(cases).where(eq(cases.id, c.id)).for("update");
    if (!locked || locked.revision !== c.revision) return;
    const source = { sourceId: a.sourceId, version: a.version };
    let findingId: string | undefined;
    if (retryOf !== undefined) {
      if (locked.status !== "broker_review") return;
      const history = await tx.select().from(events)
        .where(and(eq(events.caseId, c.id), eq(events.operation, "extract"))).orderBy(desc(events.id));
      const latest = history.find((event) => event.detail?.sourceId === a.sourceId && (event.detail?.version ?? 1) === a.version);
      if (latest?.id !== retryOf) return; // another retry already processed this attempt
      const existing = await tx.select({ id: findings.id, explanation: findings.explanation }).from(findings)
        .where(and(eq(findings.caseId, c.id), eq(findings.rule, "invalid_extraction"), eq(findings.status, "open")));
      const failedFinding = existing.find((finding) => typeof latest.detail?.findingId === "string"
        ? finding.id === latest.detail.findingId
        // Older extraction events predate the explicit finding reference.
        : finding.explanation.startsWith(`${a.sourceId}: extraction failed (`));
      if (failedFinding) {
        findingId = failedFinding.id;
        const change = outcome.ok
          ? { status: "resolved" as const, resolvedBy: "agent", resolvedAt: new Date(), resolutionReason: "Extraction retry succeeded." }
          : { explanation: `${a.sourceId}: extraction failed (${outcome.category}). ${outcome.reason}`.slice(0, 500) };
        await tx.update(findings).set(change).where(eq(findings.id, failedFinding.id));
      }
    } else if ((await extractedVersions(tx, c.id)).has(`${a.sourceId}@${a.version}`)) {
      return; // a parallel resume was faster
    }
    const base = { ...run, latencyMs: Date.now() - started };
    if (outcome.ok) {
      if (outcome.observations.length) {
        await tx
          .insert(observations)
          .values(outcome.observations.map((o) => ({ ...o, caseId: c.id, sourceId: a.sourceId, version: a.version })));
      }
      await logEvent(tx, c, "extract", {
        ...base,
        tool: outcome.model ?? run.tool, // the model that actually answered, e.g. after a fallback
        costEur: outcome.costEur ?? null,
        detail: { ...source, retryOf, observations: outcome.observations.length, attempts: outcome.attempts },
      });
    } else {
      if (!findingId) {
        const [finding] = await tx.insert(findings).values({
          caseId: c.id,
          caseRevision: c.revision,
          rule: "invalid_extraction",
          field: null,
          evidence: [],
          explanation: `${a.sourceId}: extraction failed (${outcome.category}). ${outcome.reason}`.slice(0, 500),
        }).returning({ id: findings.id });
        findingId = finding!.id;
      }
      await logEvent(tx, c, "extract", {
        ...base,
        result: "error",
        errorCategory: outcome.category,
        costEur: outcome.costEur,
        detail: { ...source, retryOf, findingId, attempts: outcome.attempts },
      });
    }
    if (retryOf !== undefined) await recomputeLocked(tx, c.id);
  });
}

/** Re-derive findings and status from stored evidence. Safe to call any time before submission. */
export async function recompute(db: Db, caseId: string) {
  await db.transaction(async (tx) => {
    await tx.select({ id: cases.id }).from(cases).where(eq(cases.id, caseId)).for("update");
    await recomputeLocked(tx, caseId);
  });
}

async function recomputeLocked(tx: Tx, caseId: string) {
  const state = await loadCase(tx, caseId);
  if (state.case.status === "submitting" || state.case.status === "submitted") return;

  await tx
    .delete(findings)
    .where(and(eq(findings.caseId, caseId), eq(findings.status, "open"), inArray(findings.rule, DERIVED_RULES)));
  const derived = [
    ...state.conflicts,
    ...state.gaps.map((g) => ({ rule: g.rule, field: g.field, explanation: g.explanation, evidence: [] })),
  ];
  if (derived.length) {
    await tx.insert(findings).values(derived.map((f) => ({ ...f, caseId, caseRevision: state.case.revision })));
  }
  const persisted = await tx
    .select({ rule: findings.rule })
    .from(findings)
    .where(and(eq(findings.caseId, caseId), eq(findings.status, "open"), notInArray(findings.rule, DERIVED_RULES)));
  const rule = decide([...derived.map((f) => f.rule), ...persisted.map((f) => f.rule)]);
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
    detail: { rule: rule.name, status: rule.status, gaps: state.gaps.length, conflicts: state.conflicts.length },
  });
}

/**
 * Broker resolves a material conflict with a reason. `acceptedSourceId` (one of the cited sources) decides whose
 * values go into the filing; null means both are right (e.g. two separate damages). Only a broker may do this.
 */
export async function resolveConflict(
  db: Db,
  caseId: string,
  findingId: string,
  input: { reason: string; acceptedSourceId: string | null },
) {
  await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(cases).where(eq(cases.id, caseId)).for("update");
    if (!locked) throw new WorkflowError("not_found", `case ${caseId} not found`);
    const [finding] = await tx
      .select()
      .from(findings)
      .where(and(eq(findings.id, findingId), eq(findings.caseId, caseId)));
    if (!finding || finding.rule !== "conflict" || finding.status !== "open") {
      throw new WorkflowError("invalid_resolution", "only an open conflict of this case can be resolved");
    }
    if (!input.reason.trim()) throw new WorkflowError("invalid_resolution", "a resolution needs a reason");
    if (input.acceptedSourceId && !finding.evidence.some((e) => e.sourceId === input.acceptedSourceId)) {
      throw new WorkflowError("invalid_resolution", "the accepted source must be one of the cited sources");
    }
    await tx
      .update(findings)
      .set({
        status: "resolved",
        resolvedBy: BROKER,
        resolutionReason: input.reason.trim(),
        resolvedAt: new Date(),
        acceptedSourceId: input.acceptedSourceId,
      })
      .where(eq(findings.id, findingId));
    await logEvent(tx, locked, "resolve", {
      detail: { findingId, field: finding.field, acceptedSourceId: input.acceptedSourceId, by: BROKER },
    });
  });
  await recompute(db, caseId);
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
    await tx
      .insert(submissions)
      .values({ caseId, approvedRevision: revision, approvedBy: BROKER, payload: filing, idempotencyKey: `${caseId}:${revision}` })
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
  const c = { id: caseId, revision: sub.approvedRevision };
  const started = Date.now();
  await db.update(submissions).set({ attempts: sub.attempts + 1, updatedAt: new Date() }).where(eq(submissions.id, sub.id));
  try {
    const { portalReference } = await portal.submit(sub.idempotencyKey, sub.payload);
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
