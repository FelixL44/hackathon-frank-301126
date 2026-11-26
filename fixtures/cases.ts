// Fixture-backed evidence: what the model would extract, so the workflow runs end to end without a model.
// All names, plates and policy numbers are synthetic. The message files and estimate PDFs are written from here
// by `npm run fixtures:generate`; a test checks every quote below against those files.
import type { ProposedObservation } from "../src/domain/schema.ts";
import type { Extractor, NewArtifact, NewCustomer } from "../src/workflow/cases.ts";

type FixtureCase = {
  title: string;
  customer: NewCustomer;
  message: string;
  /** Repair lines on page 1 of the generated estimate PDF. */
  estimateLines: string[];
  artifacts: NewArtifact[];
  observations: Record<string, ProposedObservation[]>;
};

const text = (quote: string, page = 1) => ({ type: "text" as const, quote, page });
const legible = "legible" as const;

const artifactsFor = (dir: string): NewArtifact[] => [
  { sourceId: "message-1", kind: "message", mediaType: "text/plain", objectKey: `fixtures/${dir}/message-1.txt` },
  { sourceId: "photo-1", kind: "photo", mediaType: "image/jpeg", objectKey: `fixtures/${dir}/photo-1.jpg` },
  { sourceId: "estimate-1", kind: "estimate", mediaType: "application/pdf", objectKey: `fixtures/${dir}/estimate-1.pdf` },
];

// Synthetic customers and numbers, for the demo only.
const ANA: NewCustomer = { name: "Ana Ferreira", channel: "whatsapp", address: "+351900000001" };
const RUI: NewCustomer = { name: "Rui Costa", channel: "whatsapp", address: "+351900000002" };

const FRONT_MESSAGE =
  "Hello. On 18/11/2026, while parking at the supermarket, I hit a pillar and damaged the front bumper of my car, " +
  "plate AA-12-BC. Policy no. POL-2026-000123. Thanks, Ana";

/** Policy, plate, date and event from FRONT_MESSAGE; shared by F1 and F3. */
const frontMessageFacts: ProposedObservation[] = [
  { field: "policyReference", value: "POL-2026-000123", normalized: "POL-2026-000123", locator: text("Policy no. POL-2026-000123"), readability: legible },
  { field: "vehicleId", value: "AA-12-BC", normalized: "AA-12-BC", locator: text("plate AA-12-BC"), readability: legible },
  { field: "incidentDate", value: "18/11/2026", normalized: "2026-11-18", locator: text("On 18/11/2026"), readability: legible },
  {
    field: "eventDescription",
    value: "while parking at the supermarket, I hit a pillar and damaged the front bumper",
    normalized: null,
    locator: text("while parking at the supermarket, I hit a pillar"),
    readability: legible,
  },
  { field: "damagedArea", value: "front bumper", normalized: "bumper:front", locator: text("damaged the front bumper"), readability: legible },
];

const frontPhoto: ProposedObservation[] = [
  {
    field: "damagedArea",
    value: "scratched front bumper",
    normalized: "bumper:front",
    locator: { type: "image", imageId: "photo-1", description: "Horizontal scratches on the front bumper, left of the number plate" },
    readability: legible,
  },
];

const estimatePlate: ProposedObservation = {
  field: "vehicleId",
  value: "AA-12-BC",
  normalized: "AA-12-BC",
  locator: text("Plate: AA-12-BC"),
  readability: legible,
};

export const FIXTURE_CASES: Record<string, FixtureCase> = {
  "F1-consistent": {
    title: "Complete, consistent parking damage",
    customer: ANA,
    message: FRONT_MESSAGE,
    estimateLines: ["Repair and paint front bumper"],
    artifacts: artifactsFor("F1"),
    observations: {
      "message-1": frontMessageFacts,
      "photo-1": frontPhoto,
      "estimate-1": [
        estimatePlate,
        { field: "damagedArea", value: "paint front bumper", normalized: "bumper:front", locator: text("Repair and paint front bumper"), readability: legible },
      ],
    },
  },
  "F3-front-rear-conflict": {
    title: "Report says front, estimate says rear",
    customer: ANA,
    message: FRONT_MESSAGE,
    estimateLines: ["Repair and paint rear bumper"],
    artifacts: artifactsFor("F3"),
    observations: {
      "message-1": frontMessageFacts,
      "photo-1": frontPhoto,
      "estimate-1": [
        estimatePlate,
        { field: "damagedArea", value: "paint rear bumper", normalized: "bumper:rear", locator: text("Repair and paint rear bumper"), readability: legible },
      ],
    },
  },
  "F4-both-ends": {
    title: "Report documents damage at both ends",
    customer: RUI,
    message:
      "Hi. On 18/11/2026 I hit a pillar while parking and then, while reversing, hit a post. " +
      "Both the front bumper and the rear bumper were damaged. Plate AA-12-BC, " +
      "policy no. POL-2026-000123. Regards, Rui",
    estimateLines: ["Paint front bumper", "Repair rear bumper"],
    artifacts: artifactsFor("F4"),
    observations: {
      "message-1": [
        { field: "policyReference", value: "POL-2026-000123", normalized: "POL-2026-000123", locator: text("policy no. POL-2026-000123"), readability: legible },
        { field: "vehicleId", value: "AA-12-BC", normalized: "AA-12-BC", locator: text("Plate AA-12-BC"), readability: legible },
        { field: "incidentDate", value: "18/11/2026", normalized: "2026-11-18", locator: text("On 18/11/2026"), readability: legible },
        { field: "eventDescription", value: "I hit a pillar while parking and then, while reversing, hit a post", normalized: null, locator: text("I hit a pillar while parking and then, while reversing, hit a post"), readability: legible },
        { field: "damagedArea", value: "front bumper", normalized: "bumper:front", locator: text("the front bumper"), readability: legible },
        { field: "damagedArea", value: "rear bumper", normalized: "bumper:rear", locator: text("the rear bumper"), readability: legible },
      ],
      "photo-1": frontPhoto,
      "estimate-1": [
        estimatePlate,
        { field: "damagedArea", value: "paint front bumper", normalized: "bumper:front", locator: text("Paint front bumper"), readability: legible },
        { field: "damagedArea", value: "repair rear bumper", normalized: "bumper:rear", locator: text("Repair rear bumper"), readability: legible },
      ],
    },
  },
};

export const fixtureExtractor = (fixtureId: string): Extractor => ({
  name: `fixture:${fixtureId || "none"}`,
  // A customer-created case has no fixture data: return no observations, so the case routes to the broker
  // with missing-information findings instead of crashing the intake request.
  extract: async (artifact) => ({ observations: FIXTURE_CASES[fixtureId]?.observations[artifact.sourceId] ?? [], attempts: 1 }),
});
