import { test } from "node:test";
import assert from "node:assert/strict";
import { ClaimFiling, Finding, ProposedObservation } from "./schema.ts";
import { FIXTURES } from "../../fixtures/manifest.ts";

const id = "00000000-0000-4000-8000-000000000001";
const at = "2026-11-23T10:00:00Z";
const quote = (sourceId: string, text: string) => ({
  sourceId,
  version: 1,
  locator: { type: "text" as const, quote: text, page: 1 },
});

test("text locator needs a page", () => {
  const obs = {
    field: "damagedArea",
    value: "para-choques dianteiro",
    normalized: "bumper:front",
    locator: { type: "text", quote: "para-choques dianteiro" },
    readability: "legible",
  };
  assert.equal(ProposedObservation.safeParse(obs).success, false);
  assert.equal(ProposedObservation.safeParse({ ...obs, locator: { ...obs.locator, page: 1 } }).success, true);
});

test("damagedArea is normalized as part:position", () => {
  const base = {
    field: "damagedArea",
    value: "x",
    locator: { type: "image", imageId: "photo-1", description: "scratch on front bumper" },
    readability: "legible",
  };
  assert.equal(ProposedObservation.safeParse({ ...base, normalized: "front bumper" }).success, false);
  assert.equal(ProposedObservation.safeParse({ ...base, normalized: "bumper:unknown" }).success, true);
  assert.equal(ProposedObservation.safeParse({ ...base, value: null, normalized: null }).success, true);
});

test("a conflict cites two different sources", () => {
  const finding = {
    id,
    caseId: id,
    rule: "conflict",
    field: "damagedArea",
    evidence: [quote("message-1", "para-choques dianteiro")],
    explanation: "Customer reports front, estimate says rear.",
    status: "open",
    resolution: null,
  };
  assert.equal(Finding.safeParse(finding).success, false);
  const both = { ...finding, evidence: [...finding.evidence, quote("estimate-1", "para-choques traseiro")] };
  assert.equal(Finding.safeParse(both).success, true);
  assert.equal(Finding.safeParse({ ...both, status: "resolved" }).success, false);
  assert.equal(
    Finding.safeParse({ ...both, status: "resolved", resolution: { by: "demo-broker", reason: "ok", at } }).success,
    true,
  );
});

test("filing requires every field", () => {
  const filing = {
    caseReference: "CLM-2026-0001",
    revision: 2,
    policyReference: "POL-123",
    vehicleId: "AA-00-AA",
    incidentDate: "2026-11-20",
    eventDescription: "Ao estacionar, danifiquei o para-choques dianteiro.",
    damagedArea: ["bumper:front"],
    evidence: [{ sourceId: "estimate-1", version: 2 }],
  };
  assert.equal(ClaimFiling.safeParse(filing).success, true);
  assert.equal(ClaimFiling.safeParse({ ...filing, damagedArea: [] }).success, false);
});

test("fixture manifest: nine unique IDs, no portal claim without submission", () => {
  assert.equal(FIXTURES.length, 9);
  assert.equal(new Set(FIXTURES.map((f) => f.id)).size, 9);
  for (const f of FIXTURES) {
    const submits = f.allowedSideEffects.includes("submit_claim");
    assert.equal(f.portalClaims === 1, submits, f.id);
    assert.equal(f.route.at(-1) === "submitted", submits, f.id);
  }
});
