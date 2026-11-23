// Shared case schema (HAC-5). Every workstream imports from here; change it only by team agreement.
import { z } from "zod";

export const SCHEMA_VERSION = 1;

// ── Case ────────────────────────────────────────────────────────────────────

/** Statuses from the decision policy in CLAUDE.md, plus the entry and terminal states. */
export const CaseStatus = z.enum([
  "intake", //               evidence received, extraction not finished
  "awaiting_information", // waiting for the customer or workshop to answer one question
  "broker_review", //        a material conflict or invalid model output needs a broker
  "awaiting_approval", //    all checks pass or are resolved; filing prepared
  "submitting", //           approved revision is being sent to the portal
  "submitted", //            portal receipt stored
]);
export type CaseStatus = z.infer<typeof CaseStatus>;

export const Case = z.object({
  id: z.uuid(),
  reference: z.string().min(1), // human-readable, e.g. "CLM-2026-0001"
  revision: z.int().min(1), // +1 on every reply or correction before submission
  status: CaseStatus,
  replyToken: z.string().min(16), // case-scoped token that links inbound replies to this case
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Case = z.infer<typeof Case>;

// ── Artifacts and evidence references ───────────────────────────────────────

export const ArtifactKind = z.enum(["message", "photo", "estimate"]);

/**
 * One version of one source. A corrected estimate keeps the same `sourceId`,
 * gets `version + 1` and points back via `supersedesVersion`; the original stays.
 */
export const Artifact = z.object({
  caseId: z.uuid(),
  sourceId: z.string().min(1), // stable within a case, e.g. "estimate-1", "photo-1"
  version: z.int().min(1),
  supersedesVersion: z.int().min(1).nullable(),
  kind: ArtifactKind,
  mediaType: z.string().min(1), // "text/plain", "image/jpeg", "application/pdf"
  objectKey: z.string().min(1), // private storage key, never a public URL
  receivedAt: z.iso.datetime(),
});
export type Artifact = z.infer<typeof Artifact>;

/** Where exactly an observation was seen: a quote on a page, or a visible feature in an image. */
export const Locator = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    quote: z.string().min(1), // verbatim, original language
    page: z.int().min(1), // plain messages are page 1
  }),
  z.object({
    type: z.literal("image"),
    imageId: z.string().min(1),
    description: z.string().min(1), // plain description of the visible feature
  }),
]);
export type Locator = z.infer<typeof Locator>;

export const EvidenceRef = z.object({
  sourceId: z.string().min(1),
  version: z.int().min(1),
  locator: Locator,
});
export type EvidenceRef = z.infer<typeof EvidenceRef>;

// ── Required fields and observations ────────────────────────────────────────

/** Required for every case. `caseReference` is set by the app, the rest come from evidence. */
export const RequiredField = z.enum([
  "caseReference",
  "policyReference",
  "vehicleId",
  "incidentDate",
  "eventDescription",
  "damagedArea",
]);
export type RequiredField = z.infer<typeof RequiredField>;

/** Extra rules for the parking-damage scenario: these artifact kinds must be present and usable. */
export const PARKING_DAMAGE_REQUIRED_KINDS = ["photo", "estimate"] as const satisfies readonly z.infer<
  typeof ArtifactKind
>[];

export const Readability = z.enum(["legible", "partial", "illegible"]);

/** Seen from the vehicle (driving direction), not from the camera: on a front photo, the vehicle's left is on the image's right. */
export const Position = z.enum([
  "front",
  "rear",
  "left",
  "right",
  "front_left",
  "front_right",
  "rear_left",
  "rear_right",
  "roof",
  "underbody",
  "unknown",
]);
export type Position = z.infer<typeof Position>;

const ALL_DIRECTIONS = ["front", "rear", "left", "right", "roof", "underbody"] as const;
type Direction = (typeof ALL_DIRECTIONS)[number];

/** Each position is a set of base directions; a corner covers both of its sides, unknown covers everything. */
export const POSITION_DIRECTIONS: Record<Position, readonly Direction[]> = {
  front: ["front"],
  rear: ["rear"],
  left: ["left"],
  right: ["right"],
  front_left: ["front", "left"],
  front_right: ["front", "right"],
  rear_left: ["rear", "left"],
  rear_right: ["rear", "right"],
  roof: ["roof"],
  underbody: ["underbody"],
  unknown: ALL_DIRECTIONS,
};

/** Two positions can describe the same damage iff their direction sets overlap. No overlap = candidate conflict. */
export const positionsOverlap = (a: Position, b: Position) =>
  POSITION_DIRECTIONS[a].some((d) => POSITION_DIRECTIONS[b].includes(d));

// damagedArea is normalized as "<part>:<position>", e.g. "bumper:front"; an unclear angle is "unknown".
const DAMAGED_AREA = new RegExp(`^[a-z_]+:(${Position.options.join("|")})$`);

/** What the model returns for one artifact. The app adds sourceId and version, because it knows what it sent. */
export const ProposedObservation = z
  .object({
    field: RequiredField.exclude(["caseReference"]),
    value: z.string().nullable(), // original text; null = unknown, recorded explicitly
    normalized: z.string().nullable(), // ISO date, uppercase plate, "bumper:front", …
    locator: Locator,
    readability: Readability,
  })
  .superRefine((o, ctx) => {
    if (o.field === "damagedArea" && o.normalized !== null && !DAMAGED_AREA.test(o.normalized)) {
      ctx.addIssue({ code: "custom", path: ["normalized"], message: 'damagedArea must look like "bumper:front"' });
    }
  });
export type ProposedObservation = z.infer<typeof ProposedObservation>;

export const ModelExtraction = z.object({
  observations: z.array(ProposedObservation),
});
export type ModelExtraction = z.infer<typeof ModelExtraction>;

/** A stored observation, tied to the exact artifact version it came from. */
export const Observation = ProposedObservation.and(
  z.object({ caseId: z.uuid(), sourceId: z.string().min(1), version: z.int().min(1) }),
);
export type Observation = z.infer<typeof Observation>;

// ── Findings and resolutions ────────────────────────────────────────────────

export const FindingRule = z.enum([
  "conflict", //            two current, legible sources disagree on vehicle, damaged part or event
  "missing", //             required field or document absent
  "illegible", //           present but unreadable
  "ambiguous", //           readable but unclear (e.g. viewing angle)
  "invalid_extraction", //  model output failed validation after the retry budget
]);
export type FindingRule = z.infer<typeof FindingRule>;

export const Resolution = z.object({
  by: z.string().min(1), // broker identity or demo session ID
  reason: z.string().min(1),
  at: z.iso.datetime(),
});

export const Finding = z
  .object({
    id: z.uuid(),
    caseId: z.uuid(),
    rule: FindingRule,
    field: RequiredField.nullable(), // null for document-level findings
    evidence: z.array(EvidenceRef), // supporting and conflicting references
    explanation: z.string().min(1), // short, shown to the broker
    status: z.enum(["open", "resolved"]),
    resolution: Resolution.nullable(),
  })
  .superRefine((f, ctx) => {
    if (f.rule === "conflict" && new Set(f.evidence.map((e) => e.sourceId)).size < 2) {
      ctx.addIssue({ code: "custom", path: ["evidence"], message: "a conflict cites at least two different sources" });
    }
    if ((f.status === "resolved") !== (f.resolution !== null)) {
      ctx.addIssue({ code: "custom", path: ["resolution"], message: "resolved findings need a resolution, open ones none" });
    }
  });
export type Finding = z.infer<typeof Finding>;

// ── Side effects and filing ─────────────────────────────────────────────────

/** The only side effects the workflow may trigger. Fixtures list which ones are allowed. */
export const SideEffect = z.enum(["request_information", "create_broker_task", "prepare_filing", "submit_claim"]);
export type SideEffect = z.infer<typeof SideEffect>;

/** Payload sent to the simulated portal. Snapshot is frozen at approval. */
export const ClaimFiling = z.object({
  caseReference: z.string().min(1),
  revision: z.int().min(1),
  policyReference: z.string().min(1),
  vehicleId: z.string().min(1),
  incidentDate: z.iso.date(),
  eventDescription: z.string().min(1),
  damagedArea: z.array(z.string().regex(DAMAGED_AREA)).min(1), // several when the report documents several areas
  evidence: z.array(z.object({ sourceId: z.string().min(1), version: z.int().min(1) })).min(1),
});
export type ClaimFiling = z.infer<typeof ClaimFiling>;
