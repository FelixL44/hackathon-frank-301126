import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { FIXTURE_CASES, fixtureExtractor } from "../../fixtures/cases.ts";
import { openDb, type Db } from "../db/client.ts";
import { cases, observations, portalReceipts, submissions } from "../db/schema.ts";
import { decide } from "../domain/decide.ts";
import { simulatedPortal } from "../portal/simulated.ts";
import { ExtractionError } from "../extraction/model-extractor.ts";
import { approve, caseView, loadCase, openCase, recompute, resolveConflict, retryExtraction, WorkflowError } from "./cases.ts";

import { draftCustomerRequest, finishCustomerRequest } from "./customer-requests.ts";

let db: Db;
let close: () => Promise<void>;
before(async () => {
  const opened = await openDb({ PGLITE_DIR: "memory://" });
  await opened.migrate();
  ({ db, close } = opened);
});
after(() => close());

const openF1 = () => openCase(db, FIXTURE_CASES["F1-consistent"]!, fixtureExtractor("F1-consistent"));
const count = async (caseId: string) => (await db.select().from(submissions).where(eq(submissions.caseId, caseId))).length;

test("decision table: first matching rule wins", () => {
  assert.equal(decide([]).status, "awaiting_approval");
  assert.equal(decide(["missing"]).status, "awaiting_information");
  assert.equal(decide(["missing", "conflict"]).status, "broker_review"); // conflict outranks a gap
});

test("F1: consistent claim waits for broker approval with a valid filing", async () => {
  const id = await openF1();
  const state = await loadCase(db, id);
  assert.equal(state.case.status, "awaiting_approval");
  assert.deepEqual(state.gaps, []);
  assert.deepEqual(state.filing?.damagedArea, ["bumper:front"]);
  assert.equal(state.case.policyReference, "POL-2026-000123");
});

test("approval submits once and stores the portal receipt; a double click changes nothing", async () => {
  const id = await openF1();
  const portal = simulatedPortal(db);
  await approve(db, id, 1, portal);
  await approve(db, id, 1, portal); // double click
  const [sub] = await db.select().from(submissions).where(eq(submissions.caseId, id));
  assert.equal(sub!.status, "succeeded");
  assert.match(sub!.portalReference!, /^SIM-/);
  assert.equal(await count(id), 1); // one approval + submission row
  assert.equal(sub!.approvedBy, "demo-broker");
  const receipts = await db.select().from(portalReceipts).where(eq(portalReceipts.idempotencyKey, sub!.idempotencyKey));
  assert.equal(receipts.length, 1);
  assert.equal((await loadCase(db, id)).case.status, "submitted");
});

test("portal returns the original receipt for a repeated idempotency key", async () => {
  const portal = simulatedPortal(db);
  const { filing } = await loadCase(db, await openF1());
  const first = await portal.submit("key-repeat", filing!);
  const again = await portal.submit("key-repeat", filing!);
  assert.equal(again.portalReference, first.portalReference);
});

test("approving a stale revision is rejected and submits nothing", async () => {
  const id = await openF1();
  await db.update(cases).set({ revision: 2 }).where(eq(cases.id, id)); // a reply arrived after the broker loaded the page
  await assert.rejects(approve(db, id, 1, simulatedPortal(db)), (e: unknown) => {
    return e instanceof WorkflowError && e.code === "stale_approval";
  });
  assert.equal(await count(id), 0);
});

test("failed extraction routes to broker review with the reason, and recompute keeps it", async () => {
  const failing = {
    name: "fake:failing",
    promptVersion: "test",
    async extract() {
      throw new ExtractionError("invalid_output", "observations.0: quote missing", 3);
    },
  };
  const id = await openCase(db, FIXTURE_CASES["F1-consistent"]!, failing);
  await recompute(db, id);
  const view = await caseView(db, id);
  assert.equal(view.case.status, "broker_review");
  const invalid = view.findings.filter((f) => f.rule === "invalid_extraction");
  assert.equal(invalid.length, 3); // one per artifact
  assert.match(invalid[0]!.explanation, /invalid_output/);
  const errors = view.events.filter((e) => e.operation === "extract" && e.result === "error");
  assert.equal(errors[0]!.errorCategory, "invalid_output");
  assert.equal(errors[0]!.promptVersion, "test");
});

test("F3: the broker resolves the conflict for the report; the filing then carries only the front", async () => {
  const id = await openCase(db, FIXTURE_CASES["F3-front-rear-conflict"]!, fixtureExtractor("F3-front-rear-conflict"));
  const before = await caseView(db, id);
  assert.equal(before.case.status, "broker_review");
  const conflict = before.findings.find((f) => f.rule === "conflict")!;
  assert.deepEqual([...new Set(conflict.evidence.map((e) => e.sourceId))], ["message-1", "estimate-1"]);

  await assert.rejects(resolveConflict(db, id, conflict.id, { reason: "x", acceptedSourceId: "photo-9" }), WorkflowError);
  await resolveConflict(db, id, conflict.id, { reason: "Workshop confirmed by phone: front bumper.", acceptedSourceId: "message-1" });
  await recompute(db, id); // stays resolved: same evidence, same key
  const after = await caseView(db, id);
  assert.equal(after.case.status, "awaiting_approval");
  assert.deepEqual(after.filing?.damagedArea, ["bumper:front"]);
  assert.equal(after.findings.filter((f) => f.status === "open").length, 0);
  assert.ok(after.events.some((e) => e.operation === "resolve"));
});

test("a missing required field routes to awaiting_information", async () => {
  const id = await openF1();
  await db.delete(observations).where(eq(observations.caseId, id)); // simulate: nothing could be extracted
  await recompute(db, id);
  const state = await loadCase(db, id);
  assert.equal(state.case.status, "awaiting_information");
  assert.ok(state.gaps.some((g) => g.rule === "missing" && g.field === "policyReference"));
  await assert.rejects(approve(db, id, 1, simulatedPortal(db)), WorkflowError);
});

test("broker retry reads only failed sources and restores approval without duplicating observations", async () => {
  const fixture = fixtureExtractor("F1-consistent");
  const failing = {
    ...fixture,
    async extract(artifact: Parameters<typeof fixture.extract>[0]) {
      if (artifact.kind === "estimate") throw new ExtractionError("invalid_output", "unreadable estimate", 3);
      return fixture.extract(artifact);
    },
  };
  const id = await openCase(db, FIXTURE_CASES["F1-consistent"]!, failing);
  assert.deepEqual((await caseView(db, id)).failedSources, ["estimate-1"]);

  await retryExtraction(db, id, 1, failing);
  const stillFailing = await caseView(db, id);
  assert.deepEqual(stillFailing.failedSources, ["estimate-1"]);
  assert.equal(stillFailing.findings.filter((f) => f.rule === "invalid_extraction").length, 1);

  await Promise.all([retryExtraction(db, id, 1, fixture), retryExtraction(db, id, 1, fixture)]);
  const recovered = await caseView(db, id);
  assert.equal(recovered.case.status, "awaiting_approval");
  assert.deepEqual(recovered.failedSources, []);
  assert.equal(recovered.findings.find((f) => f.rule === "invalid_extraction")?.status, "resolved");
  assert.equal(recovered.events.filter((e) => e.operation === "extract" && e.result === "ok").length, 3);
  assert.equal(recovered.observations.length, Object.values(FIXTURE_CASES["F1-consistent"]!.observations).flat().length);
});

test("a customer request waits for confirmation and a double confirmation delivers once", async () => {
  const caseId = await openCase(db, FIXTURE_CASES["F3-front-rear-conflict"]!, fixtureExtractor("F3-front-rear-conflict"));
  const input = { caseId, revision: 1, topic: "corrected_estimate" as const, instruction: "" };
  await Promise.all([draftCustomerRequest(db, input), draftCustomerRequest(db, input)]);
  const draftView = await caseView(db, caseId);
  const drafts = draftView.messages.filter((m) => m.status === "draft");
  assert.equal(drafts.length, 1);
  assert.match(drafts[0]!.body, /orçamento/);
  assert.equal(draftView.messages.filter((m) => m.status === "sent").length, 0);
  const confirmation = { caseId, revision: 1, draftId: drafts[0]!.id, body: "Pode enviar o orçamento corrigido?" };
  await Promise.all([finishCustomerRequest(db, confirmation), finishCustomerRequest(db, confirmation)]);
  const confirmedView = await caseView(db, caseId);
  assert.deepEqual(confirmedView.messages.filter((m) => m.status === "sent").map((m) => m.body), [confirmation.body]);
  assert.deepEqual(confirmedView.events.filter((e) => e.operation.endsWith("customer_request")).map((e) => e.operation),
    ["draft_customer_request", "confirm_customer_request", "send_customer_request"]);

  await draftCustomerRequest(db, input);
  const staleDraft = (await caseView(db, caseId)).messages.find((m) => m.status === "draft")!;
  await db.update(cases).set({ revision: 2 }).where(eq(cases.id, caseId));
  await assert.rejects(finishCustomerRequest(db, { ...confirmation, draftId: staleDraft.id }),
    (error: unknown) => error instanceof WorkflowError && error.code === "stale_request");
});
