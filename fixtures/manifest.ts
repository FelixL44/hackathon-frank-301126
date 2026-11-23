// Acceptance fixtures from CLAUDE.md. The evidence files and scripted steps follow in HAC-14;
// this file fixes the IDs and the expected outcome so all three workstreams test against the same targets.
import { z } from "zod";
import { CaseStatus, FindingRule, RequiredField, SideEffect } from "../src/domain/schema.ts";

export const FIXTURE_SET_VERSION = 1;

export const Fixture = z.object({
  id: z.string().regex(/^F\d-[a-z-]+$/),
  title: z.string().min(1),
  /** Statuses the case passes through after intake, in order, given the fixture's scripted steps. */
  route: z.array(CaseStatus).min(1),
  expectedFindings: z.array(z.object({ rule: FindingRule, field: RequiredField.nullable() })),
  allowedSideEffects: z.array(SideEffect),
  /** Exactly how many claims the portal may hold at the end. */
  portalClaims: z.union([z.literal(0), z.literal(1)]),
});
export type Fixture = z.infer<typeof Fixture>;

export const FIXTURES = z.array(Fixture).parse([
  {
    id: "F1-consistent",
    title: "Complete, consistent claim",
    route: ["awaiting_approval"],
    expectedFindings: [],
    allowedSideEffects: ["prepare_filing"],
    portalClaims: 0,
  },
  {
    id: "F2-blurry-photo",
    title: "Blurry photo with unreadable damage location; clearer photo arrives",
    route: ["awaiting_information", "awaiting_approval"],
    expectedFindings: [{ rule: "illegible", field: "damagedArea" }],
    allowedSideEffects: ["request_information", "prepare_filing"],
    portalClaims: 0,
  },
  {
    id: "F3-front-rear-conflict",
    title: "Report says front bumper, estimate says rear bumper",
    route: ["broker_review"],
    expectedFindings: [{ rule: "conflict", field: "damagedArea" }],
    allowedSideEffects: ["create_broker_task"],
    portalClaims: 0,
  },
  {
    id: "F4-both-ends",
    title: "Report documents damage at front and rear",
    route: ["awaiting_approval"],
    expectedFindings: [],
    allowedSideEffects: ["prepare_filing"],
    portalClaims: 0,
  },
  {
    id: "F5-corrected-estimate",
    title: "Broker requests correction; corrected estimate arrives before approval",
    route: ["broker_review", "awaiting_information", "awaiting_approval"],
    expectedFindings: [{ rule: "conflict", field: "damagedArea" }],
    allowedSideEffects: ["create_broker_task", "request_information", "prepare_filing"],
    portalClaims: 0,
  },
  {
    id: "F6-stale-approval",
    // The new evidence is deliberately consistent (an extra photo of the same damage), so this fixture
    // tests stale-approval rejection only, not conflict detection.
    title: "Consistent new evidence arrives after approval but before dispatch",
    route: ["awaiting_approval", "submitting", "awaiting_approval"],
    expectedFindings: [],
    allowedSideEffects: ["prepare_filing"],
    portalClaims: 0,
  },
  {
    id: "F7-replay-double-click",
    title: "Replayed reply and double approval click",
    route: ["awaiting_approval", "submitting", "submitted"],
    expectedFindings: [],
    allowedSideEffects: ["prepare_filing", "submit_claim"],
    portalClaims: 1,
  },
  {
    id: "F8-portal-timeout",
    title: "Portal accepts, then the client times out; recovered across restart",
    route: ["awaiting_approval", "submitting", "submitted"],
    expectedFindings: [],
    allowedSideEffects: ["prepare_filing", "submit_claim"],
    portalClaims: 1,
  },
  {
    id: "F9-invalid-model-output",
    title: "Missing source locator or invalid model output beyond retry budget",
    route: ["broker_review"],
    expectedFindings: [{ rule: "invalid_extraction", field: null }],
    allowedSideEffects: ["create_broker_task"],
    portalClaims: 0,
  },
]);
