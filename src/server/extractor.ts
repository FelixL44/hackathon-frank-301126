import { fixtureExtractor } from "../../fixtures/cases.ts";
import { modelExtractor } from "../extraction/model-extractor.ts";
import { providerFromEnv } from "../model/from-env.ts";

/** The configured model when MODEL_PROVIDER is set, otherwise the fixture's pre-extracted observations. */
export function extractorFor(fixtureId: string) {
  const provider = providerFromEnv();
  return provider ? modelExtractor(provider) : fixtureExtractor(fixtureId);
}

/** Shown in the UI so nobody mistakes fixture data for a model run. */
export function extractionLabel() {
  return providerFromEnv()?.id ?? "fixture data (no model configured)";
}
