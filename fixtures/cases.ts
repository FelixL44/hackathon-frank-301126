// Fixture-backed evidence: what the model would extract, so the workflow runs end to end without a model.
// All names, plates and policy numbers are synthetic. The message files and estimate PDFs are written from here
// by `npm run fixtures:generate`; a test checks every quote below against those files.
import type { ProposedObservation } from "../src/domain/schema.ts";
import type { Extractor, NewArtifact } from "../src/workflow/cases.ts";

type FixtureCase = {
  title: string;
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

const FRONT_MESSAGE =
  "Bom dia. No dia 18/11/2026, ao estacionar no parque do supermercado, toquei num pilar e risquei o " +
  "para-choques dianteiro do meu carro, matrícula AA-12-BC. Apólice n.º POL-2026-000123. Obrigada, Ana";

/** Policy, plate, date and event from FRONT_MESSAGE; shared by F1 and F3. */
const frontMessageFacts: ProposedObservation[] = [
  { field: "policyReference", value: "POL-2026-000123", normalized: "POL-2026-000123", locator: text("Apólice n.º POL-2026-000123"), readability: legible },
  { field: "vehicleId", value: "AA-12-BC", normalized: "AA-12-BC", locator: text("matrícula AA-12-BC"), readability: legible },
  { field: "incidentDate", value: "18/11/2026", normalized: "2026-11-18", locator: text("No dia 18/11/2026"), readability: legible },
  {
    field: "eventDescription",
    value: "ao estacionar no parque do supermercado, toquei num pilar e risquei o para-choques dianteiro",
    normalized: null,
    locator: text("ao estacionar no parque do supermercado, toquei num pilar"),
    readability: legible,
  },
  { field: "damagedArea", value: "para-choques dianteiro", normalized: "bumper:front", locator: text("risquei o para-choques dianteiro"), readability: legible },
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
  locator: text("Matrícula: AA-12-BC"),
  readability: legible,
};

export const FIXTURE_CASES: Record<string, FixtureCase> = {
  "F1-consistent": {
    title: "Complete, consistent parking damage",
    message: FRONT_MESSAGE,
    estimateLines: ["Reparação e pintura do para-choques dianteiro"],
    artifacts: artifactsFor("F1"),
    observations: {
      "message-1": frontMessageFacts,
      "photo-1": frontPhoto,
      "estimate-1": [
        estimatePlate,
        { field: "damagedArea", value: "pintura do para-choques dianteiro", normalized: "bumper:front", locator: text("Reparação e pintura do para-choques dianteiro"), readability: legible },
      ],
    },
  },
  "F3-front-rear-conflict": {
    title: "Report says front, estimate says rear",
    message: FRONT_MESSAGE,
    estimateLines: ["Reparação e pintura do para-choques traseiro"],
    artifacts: artifactsFor("F3"),
    observations: {
      "message-1": frontMessageFacts,
      "photo-1": frontPhoto,
      "estimate-1": [
        estimatePlate,
        { field: "damagedArea", value: "pintura do para-choques traseiro", normalized: "bumper:rear", locator: text("Reparação e pintura do para-choques traseiro"), readability: legible },
      ],
    },
  },
  "F4-both-ends": {
    title: "Report documents damage at both ends",
    message:
      "Olá. No dia 18/11/2026 toquei num pilar ao estacionar e depois, ao fazer marcha-atrás, bati num poste. " +
      "Ficaram danificados o para-choques dianteiro e o para-choques traseiro. Matrícula AA-12-BC, " +
      "apólice n.º POL-2026-000123. Cumprimentos, Rui",
    estimateLines: ["Pintura do para-choques dianteiro", "Reparação do para-choques traseiro"],
    artifacts: artifactsFor("F4"),
    observations: {
      "message-1": [
        { field: "policyReference", value: "POL-2026-000123", normalized: "POL-2026-000123", locator: text("apólice n.º POL-2026-000123"), readability: legible },
        { field: "vehicleId", value: "AA-12-BC", normalized: "AA-12-BC", locator: text("Matrícula AA-12-BC"), readability: legible },
        { field: "incidentDate", value: "18/11/2026", normalized: "2026-11-18", locator: text("No dia 18/11/2026"), readability: legible },
        { field: "eventDescription", value: "toquei num pilar ao estacionar e depois, ao fazer marcha-atrás, bati num poste", normalized: null, locator: text("toquei num pilar ao estacionar e depois, ao fazer marcha-atrás, bati num poste"), readability: legible },
        { field: "damagedArea", value: "para-choques dianteiro", normalized: "bumper:front", locator: text("o para-choques dianteiro"), readability: legible },
        { field: "damagedArea", value: "para-choques traseiro", normalized: "bumper:rear", locator: text("o para-choques traseiro"), readability: legible },
      ],
      "photo-1": frontPhoto,
      "estimate-1": [
        estimatePlate,
        { field: "damagedArea", value: "pintura do para-choques dianteiro", normalized: "bumper:front", locator: text("Pintura do para-choques dianteiro"), readability: legible },
        { field: "damagedArea", value: "reparação do para-choques traseiro", normalized: "bumper:rear", locator: text("Reparação do para-choques traseiro"), readability: legible },
      ],
    },
  },
};

export const fixtureExtractor = (fixtureId: string): Extractor => ({
  name: `fixture:${fixtureId}`,
  extract: async (artifact) => ({ observations: FIXTURE_CASES[fixtureId]!.observations[artifact.sourceId] ?? [], attempts: 1 }),
});
