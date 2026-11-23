// Fixture-backed evidence: what the model would extract, so the workflow runs end to end without a model.
// All names, plates and policy numbers are synthetic. Evidence files themselves follow in HAC-14.
import type { Extractor, NewArtifact } from "../src/workflow/cases.ts";
import type { ProposedObservation } from "../src/domain/schema.ts";

type FixtureCase = {
  title: string;
  message: string;
  artifacts: NewArtifact[];
  observations: Record<string, ProposedObservation[]>;
};

const text = (quote: string, page = 1) => ({ type: "text" as const, quote, page });

export const FIXTURE_CASES: Record<string, FixtureCase> = {
  "F1-consistent": {
    title: "Complete, consistent parking damage",
    message:
      "Bom dia. No dia 18/11/2026, ao estacionar no parque do supermercado, toquei num pilar e risquei o " +
      "para-choques dianteiro do meu carro, matrícula AA-12-BC. Apólice n.º POL-2026-000123. Obrigada, Ana",
    artifacts: [
      { sourceId: "message-1", kind: "message", mediaType: "text/plain", objectKey: "fixtures/F1/message-1.txt" },
      { sourceId: "photo-1", kind: "photo", mediaType: "image/jpeg", objectKey: "fixtures/F1/photo-1.jpg" },
      { sourceId: "estimate-1", kind: "estimate", mediaType: "application/pdf", objectKey: "fixtures/F1/estimate-1.pdf" },
    ],
    observations: {
      "message-1": [
        { field: "policyReference", value: "POL-2026-000123", normalized: "POL-2026-000123", locator: text("Apólice n.º POL-2026-000123"), readability: "legible" },
        { field: "vehicleId", value: "AA-12-BC", normalized: "AA-12-BC", locator: text("matrícula AA-12-BC"), readability: "legible" },
        { field: "incidentDate", value: "18/11/2026", normalized: "2026-11-18", locator: text("No dia 18/11/2026"), readability: "legible" },
        {
          field: "eventDescription",
          value: "ao estacionar no parque do supermercado, toquei num pilar e risquei o para-choques dianteiro",
          normalized: null,
          locator: text("ao estacionar no parque do supermercado, toquei num pilar"),
          readability: "legible",
        },
        { field: "damagedArea", value: "para-choques dianteiro", normalized: "bumper:front", locator: text("risquei o para-choques dianteiro"), readability: "legible" },
      ],
      "photo-1": [
        {
          field: "damagedArea",
          value: "scratched front bumper",
          normalized: "bumper:front",
          locator: { type: "image", imageId: "photo-1", description: "Horizontal scratches on the front bumper, left of the number plate" },
          readability: "legible",
        },
      ],
      "estimate-1": [
        { field: "vehicleId", value: "AA-12-BC", normalized: "AA-12-BC", locator: text("Matrícula: AA-12-BC"), readability: "legible" },
        { field: "damagedArea", value: "pintura do para-choques dianteiro", normalized: "bumper:front", locator: text("Reparação e pintura do para-choques dianteiro"), readability: "legible" },
      ],
    },
  },
};

export const fixtureExtractor = (fixtureId: string): Extractor => ({
  name: `fixture:${fixtureId}`,
  extract: async (artifact) => FIXTURE_CASES[fixtureId]!.observations[artifact.sourceId] ?? [],
});
